import { action } from "../common";
import { ProviderPullRequestActionsTypes } from "./types";
import { logError } from "@codestream/webview/logger";
import { HostApi } from "@codestream/webview/webview-api";
import {
	FetchThirdPartyPullRequestRequestType,
	FetchThirdPartyPullRequestResponse,
	ExecuteThirdPartyTypedType
} from "@codestream/protocols/agent";
import { CodeStreamState } from "..";

export const reset = () => action("RESET");

export const _addPullRequestConversations = (providerId: string, id: string, pullRequest: any) =>
	action(ProviderPullRequestActionsTypes.AddPullRequestConversations, {
		providerId,
		id,
		pullRequest
	});

export const _addPullRequestFiles = (providerId: string, id: string, pullRequestFiles: any) =>
	action(ProviderPullRequestActionsTypes.AddPullRequestFiles, {
		providerId,
		id,
		pullRequestFiles
	});

export const _addPullRequestCommits = (providerId: string, id: string, pullRequestCommits: any) =>
	action(ProviderPullRequestActionsTypes.AddPullRequestCommits, {
		providerId,
		id,
		pullRequestCommits
	});

export const getPullRequestConversationsFromProvider = (
	providerId: string,
	id: string
) => async dispatch => {
	try {
		const response = await HostApi.instance.send(FetchThirdPartyPullRequestRequestType, {
			providerId: providerId,
			pullRequestId: id
		});
		dispatch(_addPullRequestConversations(providerId, id, response));
		return response as FetchThirdPartyPullRequestResponse;
	} catch (error) {
		logError(`failed to refresh pullRequest: ${error}`, { providerId, id });
	}
	return undefined;
};

export const getPullRequestConversations = (providerId: string, id: string) => async (
	dispatch,
	getState: () => CodeStreamState
) => {
	try {
		const state = getState();
		const provider = state.providerPullRequests.pullRequests[providerId];
		if (provider) {
			const pr = provider[id];
			if (pr && pr.conversations) {
				console.log(
					`fetched pullRequest conversations from store providerId=${providerId} id=${id}`
				);
				return pr.conversations;
			}
		}
		const response = await HostApi.instance.send(FetchThirdPartyPullRequestRequestType, {
			providerId: providerId,
			pullRequestId: id
		});
		dispatch(_addPullRequestConversations(providerId, id, response));
		return response;
	} catch (error) {
		logError(`failed to get pullRequest conversations: ${error}`, { providerId, id });
	}
	return undefined;
};

/**
 * This resets the provider's files changed list
 * @param providerId
 * @param id
 */
export const clearPullRequestFiles = (providerId: string, id: string) =>
	action(ProviderPullRequestActionsTypes.ClearPullRequestFiles, {
		providerId,
		id
	});

export const getPullRequestFiles = (providerId: string, id: string) => async (
	dispatch,
	getState: () => CodeStreamState
) => {
	try {
		const state = getState();
		const provider = state.providerPullRequests.pullRequests[providerId];
		if (provider) {
			const pr = provider[id];
			if (pr && pr.files && pr.files.length) {
				console.log(`fetched pullRequest files from store providerId=${providerId} id=${id}`);
				return pr.files;
			}
		}
		const response = await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
			method: "getPullRequestFilesChanged",
			providerId: providerId,
			params: {
				pullRequestId: id
			}
		});

		dispatch(_addPullRequestFiles(providerId, id, response));
		return response;
	} catch (error) {
		logError(`failed to get pullRequest files: ${error}`, { providerId, id });
	}
	return undefined;
};

// TODO implement these
// export const getPullRequestCommitsFromProvider = (
// 	providerId: string,
// 	id: string
// ) => async dispatch => {
// 	try {
// 		const response = await HostApi.instance.send(FetchThirdPartyPullRequestRequestType, {
// 			providerId: providerId,
// 			pullRequestId: id
// 		});
// 		dispatch(_addPullRequestFiles(providerId, id, response));
// 		return response;
// 	} catch (error) {
// 		logError(`failed to refresh pullRequest commits: ${error}`, { providerId, id });
// 	}
// 	return undefined;
// };

// export const getPullRequestCommits = (providerId: string, id: string) => async (
// 	dispatch,
// 	getState: () => CodeStreamState
// ) => {
// 	try {
// 		const state = getState();
// 		const provider = state.providerPullRequests.pullRequests[providerId];
// 		if (provider) {
// 			const pr = provider[id];
// 			if (pr && pr.commits) {
// 				console.log(`fetched pr from store providerId=${providerId} id=${id}`);
// 				return pr.commits;
// 			}
// 		}
// 		const response = await HostApi.instance.send(FetchThirdPartyPullRequestRequestType, {
// 			providerId: providerId,
// 			pullRequestId: id
// 		});
// 		dispatch(_addPullRequestFiles(providerId, id, response));
// 		return response;
// 	} catch (error) {
// 		logError(`failed to get pullRequest files: ${error}`, { providerId, id });
// 	}
// 	return undefined;
// };
