import { ActionType, Index } from "../common";
import * as actions from "./actions";
import { ProviderPullRequestActionsTypes, ProviderPullRequestsState } from "./types";

type ProviderPullRequestActions = ActionType<typeof actions>;

const initialState: ProviderPullRequestsState = { pullRequests: {} };

const createNewObject = (state, action) => {
	const newState = { ...state.pullRequests };
	newState[action.payload.providerId] = newState[action.payload.providerId] || {};
	return newState;
};

export function reduceProviderPullRequests(
	state = initialState,
	action: ProviderPullRequestActions
): ProviderPullRequestsState {
	switch (action.type) {
		case ProviderPullRequestActionsTypes.AddPullRequestFiles: {
			const newState = createNewObject(state, action);
			newState[action.payload.providerId][action.payload.id] = {
				...newState[action.payload.providerId][action.payload.id],
				files: action.payload.pullRequestFiles
			};
			return {
				pullRequests: newState
			};
		}

		case ProviderPullRequestActionsTypes.ClearPullRequestFiles: {
			const newState = createNewObject(state, action);
			newState[action.payload.providerId][action.payload.id] = {
				...newState[action.payload.providerId][action.payload.id],
				files: []
			};
			return {
				pullRequests: newState
			};
		}
		case ProviderPullRequestActionsTypes.AddPullRequestFiles: {
			const newState = createNewObject(state, action);
			newState[action.payload.providerId][action.payload.id] = {
				...newState[action.payload.providerId][action.payload.id],
				files: action.payload.pullRequestFiles
			};
			return {
				pullRequests: newState
			};
		}
		case ProviderPullRequestActionsTypes.AddPullRequestConversations: {
			const newState = createNewObject(state, action);
			newState[action.payload.providerId][action.payload.id] = {
				...newState[action.payload.providerId][action.payload.id],
				conversations: action.payload.pullRequest
			};
			return {
				pullRequests: newState
			};
		}
		case "RESET":
			return initialState;
		default:
			return state;
	}
}
