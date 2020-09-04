"use strict";

import { GitRemote } from "git/gitService";
import { URI } from "vscode-uri";
import { Logger } from "../logger";
import { EnterpriseConfigurationData } from "../protocol/agent.protocol.providers";
import { log, lspProvider } from "../system";
import { GitHubProvider } from "./github";
import {
	ProviderCreatePullRequestRequest,
	ProviderCreatePullRequestResponse,
	ProviderGetRepoInfoResponse,
	ProviderPullRequestInfo
} from "./provider";

@lspProvider("github_enterprise")
export class GitHubEnterpriseProvider extends GitHubProvider {
	get displayName() {
		return "GitHub Enterprise";
	}

	get name() {
		return "github_enterprise";
	}

	get apiPath() {
		return this.providerConfig.forEnterprise || this.providerConfig.isEnterprise ? "/api/v3" : "";
	}

	get baseUrl() {
		const { host, apiHost, isEnterprise, forEnterprise } = this.providerConfig;
		let returnHost;
		if (isEnterprise) {
			returnHost = host;
		} else if (forEnterprise) {
			returnHost = this._providerInfo?.data?.baseUrl || host;
			return `${returnHost}/api`;
		} else {
			returnHost = `https://${apiHost}`;
		}
		return `${returnHost}${this.apiPath}`;
	}

	getIsMatchingRemotePredicate() {
		const baseUrl = this._providerInfo?.data?.baseUrl || this.getConfig().host;
		const configDomain = baseUrl ? URI.parse(baseUrl).authority : "";
		return (r: GitRemote) => configDomain !== "" && r.domain === configDomain;
	}

	private _isPRApiCompatible: boolean | undefined;
	protected async isPRApiCompatible(): Promise<boolean> {
		if (this._isPRApiCompatible == null) {
			const response = await this.get<{ installed_version: string }>("/meta");

			const [major, minor] = response.body.installed_version.split(".").map(Number);
			this._isPRApiCompatible = major > 2 || (major === 2 && minor >= 15);
		}

		return this._isPRApiCompatible;
	}

	@log()
	async createPullRequest(
		request: ProviderCreatePullRequestRequest
	): Promise<ProviderCreatePullRequestResponse | undefined> {
		void (await this.ensureConnected());

		if (!(await this.isPRApiCompatible())) return undefined;

		try {
			const repoInfo = await this.getRepoInfo({ remote: request.remote });
			if (repoInfo && repoInfo.error) {
				return {
					error: repoInfo.error
				};
			}
			const { owner, name } = this.getOwnerFromRemote(request.remote);

			const createPullRequestResponse = await this.post<
				GitHubEnterpriseCreatePullRequestRequest,
				GitHubEnterpriseCreatePullRequestResponse
			>(`/repos/${owner}/${name}/pulls`, {
				head: request.headRefName,
				base: request.baseRefName,
				title: request.title,
				body: this.createDescription(request)
			});

			const title = `#${createPullRequestResponse.body.number} ${createPullRequestResponse.body.title}`;
			return {
				url: createPullRequestResponse.body.html_url,
				title: title
			};
		} catch (ex) {
			Logger.error(ex, `${this.displayName}: getRepoInfo`, {
				remote: request.remote,
				head: request.headRefName,
				base: request.baseRefName
			});
			return {
				error: {
					type: "PROVIDER",
					message: `${this.displayName}: ${ex.message}`
				}
			};
		}
	}

	async getRepoInfo(request: { remote: string }): Promise<ProviderGetRepoInfoResponse> {
		try {
			const { owner, name } = this.getOwnerFromRemote(request.remote);
			const repoResponse = await this.get<GitHubEnterpriseRepo>(`/repos/${owner}/${name}`);
			const pullRequestResponse = await this.get<GitHubEnterprisePullRequest[]>(
				`/repos/${owner}/${name}/pulls?state=open`
			);
			const pullRequests: ProviderPullRequestInfo[] = [];
			if (pullRequestResponse) {
				pullRequestResponse.body.map(_ => {
					return {
						id: _.id,
						url: _.html_url,
						baseRefName: _.base.ref,
						headRefName: _.head.ref
					};
				});
			}
			return {
				id: repoResponse.body.id,
				defaultBranch: repoResponse.body.default_branch,
				pullRequests: pullRequests
			};
		} catch (ex) {
			Logger.error(ex, `${this.displayName}: getRepoInfo`, {
				remote: request.remote
			});
			return {
				error: {
					type: "PROVIDER",
					message: `${this.displayName}: ${ex.message}`
				}
			};
		}
	}

	@log()
	async configure(request: EnterpriseConfigurationData) {
		await this.session.api.setThirdPartyProviderToken({
			providerId: this.providerConfig.id,
			host: request.host,
			token: request.token,
			data: {
				baseUrl: request.baseUrl
			}
		});
		this.session.updateProviders();
	}
}

interface GitHubEnterpriseRepo {
	id: string;
	full_name: string;
	path: string;
	has_issues: boolean;
	default_branch: string;
}

interface GitHubEnterprisePullRequest {
	id: string;
	html_url: string;
	base: { ref: string };
	head: { ref: string };
}

interface GitHubEnterpriseCreatePullRequestRequest {
	head: string;
	base: string;
	title: string;
	body?: string;
}

interface GitHubEnterpriseCreatePullRequestResponse {
	html_url: string;
	number: number;
	title: string;
}
