import { ActionType, Index } from "../common";
import * as actions from "./actions";
import { ProviderPullRequestActionsTypes, ProviderPullRequestsState } from "./types";

type ProviderPullRequestActions = ActionType<typeof actions>;

const initialState: ProviderPullRequestsState = { pullRequests: {}, myPullRequests: {} };

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
		case ProviderPullRequestActionsTypes.AddMyPullRequests: {
			const newState = { ...state.myPullRequests };
			newState[action.payload.providerId] = {
				data: action.payload.data
			};
			return {
				myPullRequests: newState,
				pullRequests: { ...state.pullRequests }
			};
		}
		case ProviderPullRequestActionsTypes.RemoveFromMyPullRequests: {
			const newState = { ...state.myPullRequests };
			newState[action.payload.providerId] = {
				data: (newState[action.payload.providerId].data || []).filter(
					_ => _.id !== action.payload.id
				)
			};
			return {
				myPullRequests: newState,
				pullRequests: { ...state.pullRequests }
			};
		}
		case ProviderPullRequestActionsTypes.ClearMyPullRequests: {
			const newState = { ...state.myPullRequests };
			newState[action.payload.providerId] = {
				data: undefined
			};
			return {
				myPullRequests: newState,
				pullRequests: { ...state.pullRequests }
			};
		}
		case ProviderPullRequestActionsTypes.AddPullRequestFiles: {
			const newState = createNewObject(state, action);
			newState[action.payload.providerId][action.payload.id] = {
				...newState[action.payload.providerId][action.payload.id],
				files: action.payload.pullRequestFiles
			};
			return {
				myPullRequests: { ...state.myPullRequests },
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
				myPullRequests: { ...state.myPullRequests },
				pullRequests: newState
			};
		}
		case ProviderPullRequestActionsTypes.AddPullRequestCommits: {
			const newState = createNewObject(state, action);
			newState[action.payload.providerId][action.payload.id] = {
				...newState[action.payload.providerId][action.payload.id],
				commits: action.payload.pullRequestCommits
			};
			return {
				myPullRequests: { ...state.myPullRequests },
				pullRequests: newState
			};
		}
		case ProviderPullRequestActionsTypes.ClearPullRequestCommits: {
			const newState = createNewObject(state, action);
			newState[action.payload.providerId][action.payload.id] = {
				...newState[action.payload.providerId][action.payload.id],
				commits: []
			};
			return {
				myPullRequests: { ...state.myPullRequests },
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
				myPullRequests: { ...state.myPullRequests },
				pullRequests: newState
			};
		}
		case "RESET":
			return initialState;
		default:
			return state;
	}
}
