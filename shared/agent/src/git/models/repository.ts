"use strict";
import { WorkspaceFolder } from "vscode-languageserver";
import { SessionContainer } from "../../container";
import { Logger } from "../../logger";
import {
	CSBitbucketProviderInfo,
	CSFileStream,
	CSMe,
	CSRepository
} from "../../protocol/api.protocol";
import {
	ThirdPartyProvider,
	ThirdPartyProviderSupportsPullRequests
} from "../../providers/provider";
import { GitRemote } from "./models";

export class GitRepository {
	readonly normalizedPath: string;

	private readonly _knownRepositorySearchPromise: Promise<CSRepository | undefined>;
	private readonly _defaultRemoteBranchReferencesPromise: Promise<(string | undefined)[]>;
	private _knownRepository: CSRepository | undefined;

	constructor(
		public readonly path: string,
		public readonly root: boolean,
		public readonly folder: WorkspaceFolder,
		knownRepos: Map<string, CSRepository>,
		public readonly isInWorkspace: boolean
	) {
		this.normalizedPath = (this.path.endsWith("/") ? this.path : `${this.path}/`).toLowerCase();

		this._knownRepositorySearchPromise = this.searchForKnownRepository(knownRepos);
		this._defaultRemoteBranchReferencesPromise = this.getDefaultRemoteBranchReferencesPromise();
	}

	get id() {
		return this._knownRepository !== undefined ? this._knownRepository.id : undefined;
	}

	async ensureSearchComplete() {
		await this._knownRepositorySearchPromise;
	}

	getRemotes() {
		return SessionContainer.instance().git.getRepoRemotes(this.path);
	}

	async getStreams(): Promise<CSFileStream[]> {
		if (this.id === undefined) return [];

		return SessionContainer.instance().files.getByRepoId(this.id);
	}

	async searchForKnownRepository(knownRepos: Map<string, CSRepository>) {
		let found;

		const remotes = await this.getRemotes();
		for (const r of remotes) {
			const repo = knownRepos.get(r.normalizedUrl);
			if (repo !== undefined) {
				found = repo;
				break;
			}
		}

		this._knownRepository = found;
		return this._knownRepository;
	}

	setKnownRepository(repo: CSRepository) {
		this._knownRepository = repo;
	}

	private async getDefaultRemoteBranchReferencesPromise() {
		const { git } = SessionContainer.instance();
		const references: string[] = [];
		for (const remote of ["upstream", "origin"]) {
			const branchName = await git.getDefaultBranch(this.path, remote);
			if (branchName) {
				references.push(`refs/remotes/${remote}/${branchName}`);
			}
		}
		return references;
	}

	getDefaultRemoteBranchReferences() {
		return this._defaultRemoteBranchReferencesPromise;
	}

	/**
	 * Given a CS user, and a list of pull request providers, try to figure out if the remote
	 * for this repo has a connected PR provider
	 *
	 * @param {CSMe} [user]
	 * @param {((ThirdPartyProvider & ThirdPartyProviderSupportsPullRequests)[])} [connectedProviders]
	 * @return {*}
	 * @memberof GitRepository
	 */
	async getPullRequestProvider(
		user?: CSMe,
		connectedProviders?: (ThirdPartyProvider & ThirdPartyProviderSupportsPullRequests)[]
	): Promise<
		| {
				repo: GitRepository;
				providerId: string;
				provider: ThirdPartyProvider & ThirdPartyProviderSupportsPullRequests;
				remotes: GitRemote[];
				remotePaths: string[] | undefined;
		  }
		| undefined
	> {
		try {
			if (!user) {
				Logger.warn("getPullRequestProvider no CSMe user");
				return undefined;
			}
			const { providerRegistry, session } = SessionContainer.instance();
			const remotes = await this.getRemotes();

			if (!connectedProviders) {
				Logger.debug("getPullRequestProvider no connectedProviders, getting");
				connectedProviders = await providerRegistry.getConnectedPullRequestProviders(user);
			}

			for (const provider of connectedProviders) {
				try {
					const projectsByRemotePath = new Map((remotes || []).map(obj => [obj.path, obj]));

					const remotePaths = await provider.getRemotePaths(this, projectsByRemotePath);
					if (remotePaths && remotePaths.length) {
						const providerId = provider.getConfig().id;
						const isProviderConnected = await this.isProviderConnected(
							providerId,
							provider,
							user,
							session.teamId
						);
						if (isProviderConnected) {
							Logger.debug(
								`getPullRequestProvider found connected provider (${providerId}) for teamId=${session.teamId}`
							);
							return {
								repo: this,
								providerId: providerId,
								provider: provider,
								remotes: remotes,
								remotePaths: remotePaths
							};
						}
					}
				} catch (ex) {
					Logger.warn(ex);
				}
			}
		} catch (ex) {
			Logger.error(ex);
		}
		return undefined;
	}

	private async isProviderConnected(
		providerId: string,
		provider: ThirdPartyProvider,
		user: CSMe,
		teamId: string
	) {
		if (!user || !user.providerInfo) return false;
		const teamProviderInfo = user.providerInfo[teamId];

		if (teamProviderInfo && providerId === "bitbucket*org") {
			const bitbucket = teamProviderInfo["bitbucket"] as CSBitbucketProviderInfo;
			// require old apps reconnect to get the PR write scope
			if (
				bitbucket &&
				bitbucket.data &&
				bitbucket.data.scopes &&
				bitbucket.data.scopes.indexOf("pullrequest:write") === -1
			) {
				await provider.disconnect({});
				return false;
			}
		} else {
			const userProviderId = user.providerInfo[provider.name];
			if (userProviderId) return true;
			if (!teamProviderInfo || !teamProviderInfo[provider.name]) return false;
		}
		return true;
	}
}
