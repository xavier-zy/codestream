import { GitRemote, GitRepository } from "git/models/models";
import { ReposScm } from "protocol/agent.protocol";

export namespace GitRepositoryExtensions {
	/**
	 * Converts a GitRepository into a RepoScm object
	 *
	 * @export
	 * @param {GitRepository} repo
	 * @param {(string | undefined)} currentBranch
	 * @param {GitRemote[]} remotes
	 * @return {*}  {ReposScm}
	 */
	export function toRepoScm(
		repo: GitRepository,
		currentBranch: string | undefined,
		remotes: GitRemote[]
	): ReposScm {
		return {
			id: repo.id,
			path: repo.path,
			folder: repo.folder,
			root: repo.root,
			currentBranch: currentBranch,
			remotes: remotes,
			providerGuess:
				// FIXME -- not sure how to map remotes to github enterprise, gitlab onprem, etc.
				remotes
					? remotes.find(remote => remote.domain.includes("github"))
						? "github"
						: remotes.find(remote => remote.domain.includes("gitlab"))
						? "gitlab"
						: remotes.find(remote => remote.domain.includes("bitbucket"))
						? "bitbucket"
						: ""
					: undefined
		};
	}
}
