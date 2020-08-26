import { Index } from "../common";

export enum ProviderPullRequestActionsTypes {
	AddPullRequestConversations = "@providerPullRequests/AddConversations ",
	AddPullRequestFiles = "@providerPullRequests/AddFiles",
	AddPullRequestCommits = "@providerPullRequests/AddCommits",
	ClearPullRequestFiles = "@providerPullRequests/ClearFiles"
}

/**
 * data structure is as such:
 * "github*com": {
 * 		"prId": {
 * 			conversations: any,
 * 			files: any[]
 * 			commits: any[]
 * 		}
 * }
 */
export type ProviderPullRequestsState = {
	pullRequests: Index<Index<{ conversations: any; files?: any[]; commits?: any[] }>>;
};
