import { action } from "../common";
import { ProvidersState, ProvidersActionsType } from "./types";
import { HostApi } from "../../webview-api";
import {
	ConnectThirdPartyProviderRequestType,
	ConfigureThirdPartyProviderRequestType,
	AddEnterpriseProviderRequestType,
	DisconnectThirdPartyProviderRequestType,
	RemoveEnterpriseProviderRequestType,
	TelemetryRequestType
} from "@codestream/protocols/agent";
import { ConnectToIDEProviderRequestType, DisconnectFromIDEProviderRequestType } from "../../ipc/host.protocol";
import { CSMe } from "@codestream/protocols/api";
import { logError } from "../../logger";
import { setIssueProvider, openPanel } from "../context/actions";
import { deleteForProvider } from "../activeIntegrations/actions";

export const reset = () => action("RESET");

export const getUserProviderInfo = (user: CSMe, provider: string, teamId: string) => {
	const providerInfo = user.providerInfo || {};
	const userProviderInfo = providerInfo[provider];
	const teamProviderInfo = providerInfo[teamId] && providerInfo[teamId][provider];
	return userProviderInfo || teamProviderInfo;
};

export const updateProviders = (data: ProvidersState) => action(ProvidersActionsType.Update, data);

export const configureAndConnectProvider = (
	providerId: string,
	connectionLocation: ViewLocation,
	force?: boolean
) => async (dispatch, getState) => {
	const { providers } = getState();
	const provider = providers[providerId];
	const { forEnterprise, isEnterprise, name, needsConfigure } = provider;
	if (needsConfigure) {
		dispatch(openPanel(`configure-provider-${provider.name}-${provider.id}-Integrations Panel`));
	} else if ((forEnterprise || isEnterprise) && name !== "jiraserver") {
		dispatch(openPanel(`configure-enterprise-${name}-${provider.id}-Integrations Panel`));
	} else {
		dispatch(connectProvider(provider.id, connectionLocation, force));
	}
};

export const connectProvider = (providerId: string, connectionLocation: ViewLocation, force?: boolean) => async (
	dispatch,
	getState
) => {
	const { context, users, session, providers, ide, capabilities } = getState();
	const provider = providers[providerId];
	if (!provider) return;
	const user = users[session.userId];
	const { name, id, isEnterprise } = provider;
	let providerInfo = getUserProviderInfo(user, name, context.currentTeamId);
	if (providerInfo && isEnterprise) {
		providerInfo = (providerInfo.hosts || {})[id];
	}
	if (!force && providerInfo && providerInfo.accessToken) {
		if (provider.hasIssues) {
			dispatch(setIssueProvider(providerId));
		}
		return { alreadyConnected: true };
	}
	try {
		const api = HostApi.instance;
		if (ide.name === "VSC" && name === "github" && capabilities.vsCodeGithubSignin) {
			const result = await api.send(ConnectToIDEProviderRequestType, { provider: name });
			dispatch(configureProvider(
				providerId, { token: result.accessToken, data: { sessionId: result.sessionId } }, true)
			);
			return {};
		} else {
			await api.send(ConnectThirdPartyProviderRequestType, { providerId });
		}
		if (provider.hasIssues) {
			dispatch(sendIssueProviderConnected(providerId, connectionLocation));
			dispatch(setIssueProvider(providerId));
			return {};
		}
	} catch (error) {
		logError(`Failed to connect ${provider.name}: ${error}`);
	}
	return {};
};

export type ViewLocation =
	| "Global Nav"
	| "Compose Modal"
	| "PR Toggle"
	| "Integrations Panel"
	| "Status"
	| "Sidebar"
	| "Create Pull Request Panel"
	| "Issues Section"
	| "Provider Error Banner";

export const sendIssueProviderConnected = (
	providerId: string,
	connectionLocation: ViewLocation = "Compose Modal"
) => async (dispatch, getState) => {
	const { providers } = getState();
	const provider = providers[providerId];
	if (!provider) return;
	const { name, host, isEnterprise } = provider;
	const api = HostApi.instance;
	api.send(TelemetryRequestType, {
		eventName: "Issue Service Connected",
		properties: {
			Service: name,
			Host: isEnterprise ? host : null,
			Connection: "On",
			"Connection Location": connectionLocation
		}
	});
};

export const configureProvider = (
	providerId: string,
	data: { [key: string]: any },
	setConnectedWhenConfigured = false,
	connectionLocation?: ViewLocation
) => async (dispatch, getState) => {
	const { providers } = getState();
	const provider = providers[providerId];
	if (!provider) return;
	try {
		const api = HostApi.instance;
		await api.send(ConfigureThirdPartyProviderRequestType, { providerId, data });
		api.send(TelemetryRequestType, {
			eventName: "Issue Service Configured",
			properties: {
				Service: provider.name
			}
		});

		// for some providers (YouTrack and enterprise providers with PATs), configuring is as good as connecting,
		// since we allow the user to set their own access token
		if (setConnectedWhenConfigured && provider.hasIssues) {
			dispatch(sendIssueProviderConnected(providerId, connectionLocation));
			dispatch(setIssueProvider(providerId));
		}
	} catch (error) {
		logError(`Failed to connect ${provider.name}: ${error}`);
	}
};

export const addEnterpriseProvider = (
	providerId: string,
	host: string,
	data: { [key: string]: any }
) => async (dispatch, getState) => {
	const { providers } = getState();
	const provider = providers[providerId];
	if (!provider) return;
	try {
		const api = HostApi.instance;
		const response = await api.send(AddEnterpriseProviderRequestType, { providerId, host, data });
		api.send(TelemetryRequestType, {
			eventName: "Issue Service Configured",
			properties: {
				Service: provider.name
			}
		});
		return response.providerId;
	} catch (error) {
		logError(`Failed to add enterprise provider for ${provider.name}: ${error}`);
		return "";
	}
};

export const removeEnterpriseProvider = (providerId: string) => async (dispatch, getState) => {
	const { providers } = getState();
	const provider = providers[providerId];
	if (!provider) return;
	try {
		HostApi.instance.send(RemoveEnterpriseProviderRequestType, {
			providerId
		});
	} catch (error) {
		logError(`Failed to remove enterprise provider for ${providerId}: ${error}`);
	}
};

export const disconnectProvider = (
	providerId: string,
	connectionLocation: ViewLocation,
	providerTeamId?: string
) => async (dispatch, getState) => {
	try {
		const { context, providers, users, session, ide } = getState();
		const provider = providers[providerId];
		if (!provider) return;
		const api = HostApi.instance;
		await api.send(DisconnectThirdPartyProviderRequestType, { providerId, providerTeamId });
		if (ide.name === "VSC" && provider === "github") {
			await api.send(DisconnectFromIDEProviderRequestType, { provider });
		}
		api.send(TelemetryRequestType, {
			eventName: "Issue Service Connected",
			properties: {
				Service: provider.name,
				Host: provider.isEnterprise ? provider.host : null,
				Connection: "Off",
				"Connection Location": connectionLocation // ? "Global Nav" : "Compose Modal"
			}
		});
		dispatch(deleteForProvider(providerId, providerTeamId));
		if (getState().context.issueProvider === provider.host) {
			dispatch(setIssueProvider(undefined));
		}
	} catch (error) {
		logError("failed to disconnect service", { providerId, message: error.toString() });
	}
};
