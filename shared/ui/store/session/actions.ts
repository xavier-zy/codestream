import { action } from "../common";
import { SessionActionType, SessionState } from "./types";
import { HostApi } from "../../webview-api";
import { reset } from "../actions";
import { LogoutRequestType, AcceptTOSRequestType } from "@codestream/protocols/webview";
import { setBootstrapped } from "../bootstrapped/actions";
import { setUserPreference } from "../../Stream/actions";
import {
	TokenLoginRequestType,
	GetAccessTokenRequestType,
	isLoginFailResponse,
	TokenLoginRequest,
	DeleteMeUserRequestType,
	ConfirmLoginCodeRequest,
	EnvironmentInfo
} from "@codestream/protocols/agent";
import { CodeStreamState } from "../index";
import { CSMe } from "@codestream/protocols/api";
import { onLogin, PasswordLoginParams } from "@codestream/webview/Authentication/actions";
import { logError } from "@codestream/webview/logger";
import { goToSignup, setTeamlessContext } from "../context/actions";
import { UpdateServerUrlRequestType } from "../../ipc/host.protocol";

export { reset };

export const setSession = (session: Partial<SessionState>) =>
	action(SessionActionType.Set, session);

export const setTOS = (value: boolean) => action(SessionActionType.SetTOS, value);

export const acceptTOS = () => async (dispatch, getState: () => CodeStreamState) => {
	const { session } = getState();

	if (session.userId) {
		await dispatch(setUserPreference(["acceptedTOS"], true));
	}

	dispatch(setTOS(true));
};

export const setMaintenanceMode = (
	value: boolean,
	meta?: PasswordLoginParams | TokenLoginRequest | ConfirmLoginCodeRequest
) => action(SessionActionType.SetMaintenanceMode, value, meta);

export const logout = () => async (dispatch, getState: () => CodeStreamState) => {
	const { users, session, ide } = getState();

	dispatch(setBootstrapped(false));
	/*
	if (ide.name === "VSC") {
		await HostApi.instance.send(DisconnectFromIDEProviderRequestType, { provider: "github" });
	}
	*/
	await HostApi.instance.send(LogoutRequestType, {});
	dispatch(reset());
	dispatch(setBootstrapped(true));
};

export const switchToTeam = (
	teamId: string,
	options?: { codemarkId?: string; reviewId?: string }
) => async (dispatch, getState: () => CodeStreamState) => {
	const { accessToken } = await HostApi.instance.send(GetAccessTokenRequestType, {});

	const { configs, context, users, session, codemarks } = getState();
	const user = users[session.userId!] as CSMe;

	dispatch(setBootstrapped(false));
	dispatch(reset());

	await HostApi.instance.send(LogoutRequestType, {});
	const response = await HostApi.instance.send(TokenLoginRequestType, {
		token: {
			email: user.email,
			value: accessToken,
			url: configs.serverUrl,
			teamId: teamId,
			providerAccess: context.chatProviderAccess as any
		},
		teamId: teamId,
		codemarkId: options?.codemarkId,
		reviewId: options?.reviewId
	});

	if (isLoginFailResponse(response)) {
		logError("Failed to switch teams", { ...response, userId: user.id, email: user.email });
		return dispatch(setBootstrapped(true));
	}

	dispatch(setUserPreference(["lastTeamId"], teamId));

	return dispatch(onLogin(response));
};

export const setEnvironment = (environment: string, serverUrl: string) => async (
	dispatch,
	getState: () => CodeStreamState
) => {
	await HostApi.instance.send(UpdateServerUrlRequestType, {
		serverUrl,
		environment
	});
	dispatch(setTeamlessContext({ selectedRegion: environment! }));
};

export const switchToForeignCompany = (companyId: string) => async (
	dispatch,
	getState: () => CodeStreamState
) => {
	const { companies, session, users } = getState();
	const company = companies[companyId];
	const user = users[session.userId!] as CSMe;
	const teamId = company.everyoneTeamId;
	if (!company) {
		console.error(`Could not switch to organization ${companyId}, not found`);
		return;
	} else if (!company.host) {
		console.error(`Could not switch to organization ${companyId}, not a foregin company`);
		return;
	} else if (!company.host.accessToken) {
		console.error(`Could not switch to organization ${companyId}, no access token`);
	}

	// must switch environments (i.e., host, region, etc) to join this organization
	console.log(
		`Joining company ${company.name} requires switching host to ${company.host.name} at ${company.host.host}`
	);
	await HostApi.instance.send(UpdateServerUrlRequestType, {
		serverUrl: company.host.host,
		environment: company.host.key
	});
	dispatch(setTeamlessContext({ selectedRegion: company.host.key }));

	dispatch(setBootstrapped(false));
	dispatch(reset());

	await HostApi.instance.send(LogoutRequestType, { newServerUrl: company.host.host });
	const response = await HostApi.instance.send(TokenLoginRequestType, {
		token: {
			email: user.email,
			value: company.host.accessToken!,
			url: company.host.host,
			teamId
		},
		setEnvironment: {
			environment: company.host.key!,
			serverUrl: company.host.host
		},
		teamId
	});

	if (isLoginFailResponse(response)) {
		logError("Failed to switch to foreign company", {
			...response,
			userId: user.id,
			email: user.email
		});
		return dispatch(setBootstrapped(true));
	}

	dispatch(setUserPreference(["lastTeamId"], teamId));

	return dispatch(onLogin(response));
};

export const changeRegistrationEmail = (userId: string) => async (
	dispatch,
	getState: () => CodeStreamState
) => {
	await HostApi.instance.send(DeleteMeUserRequestType, { userId: userId });
	return dispatch(goToSignup({}));
};
