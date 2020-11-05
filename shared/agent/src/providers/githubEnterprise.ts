"use strict";

import { GitRemoteLike } from "git/gitService";
import { GraphQLClient } from "graphql-request";
import semver from "semver";
import { URI } from "vscode-uri";
import { Container } from "../container";
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
	private static ApiVersionString = "v3";

	get displayName() {
		return "GitHub Enterprise";
	}

	get name() {
		return "github_enterprise";
	}

	get apiPath() {
		return this.providerConfig.forEnterprise || this.providerConfig.isEnterprise
			? `/api/${GitHubEnterpriseProvider.ApiVersionString}`
			: "";
	}

	get baseUrl() {
		const { host, apiHost, isEnterprise, forEnterprise } = this.providerConfig;
		let returnHost;
		if (isEnterprise) {
			returnHost = host;
		} else if (forEnterprise) {
			returnHost = this._providerInfo?.data?.baseUrl || host;
		} else {
			returnHost = `https://${apiHost}`;
		}
		return `${returnHost}${this.apiPath}`;
	}

	get graphQlBaseUrl() {
		return `${this.baseUrl.replace(`/${GitHubEnterpriseProvider.ApiVersionString}`, "")}/graphql`;
	}

	async ensureInitialized() {
		await this.getVersion();
	}

	protected async getVersion(): Promise<string> {
		try {
			if (this._version == null) {
				const response = await this.get<{ installed_version: string }>("/meta");
				this._version = response.body.installed_version;
				Logger.log(
					`GitHubEnterprise getVersion - ${this.providerConfig.id} version=${this._version}`
				);
				Container.instance().errorReporter.reportBreadcrumb({
					message: `GitHubEnterprise getVersion`,
					data: {
						version: this._version
					}
				});
			}
		} catch (ex) {
			Logger.error(ex);
			this._version = "0.0.0";
		}
		return this._version;
	}

	getIsMatchingRemotePredicate() {
		const baseUrl = this._providerInfo?.data?.baseUrl || this.getConfig().host;
		const configDomain = baseUrl ? URI.parse(baseUrl).authority : "";
		return (r: GitRemoteLike) => configDomain !== "" && r.domain === configDomain;
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
				id: createPullRequestResponse.body.node_id,
				title: title
			};
		} catch (ex) {
			Logger.error(ex, `${this.displayName}: createPullRequest`, {
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

	private _atMe: string | undefined;
	/**
	 * getMe - gets the username (login) for a GH request
	 *
	 * @protected
	 * @return {*}  {Promise<string>}
	 * @memberof GitHubEnterpriseProvider
	 */
	protected async getMe(): Promise<string> {
		if (this._atMe) return this._atMe;

		try {
			const query = await this.query<any>(`
			query {
				viewer {
					login
				}
			}`);

			this._atMe = query.viewer.login;
			return this._atMe!;
		} catch (ex) {
			Logger.error(ex);
		}
		this._atMe = await super.getMe();
		return this._atMe;
	}

	protected async client(): Promise<GraphQLClient> {
		if (this._client === undefined && this.accessToken) {
			// query for the version
			await this.getVersion();
		}
		return super.client();
	}

	async query<T = any>(query: string, variables: any = undefined) {
		const v = await this.getVersion();
		// we know that in version 2.19.6, @me doesn't work
		if (v && semver.lt(v, "2.21.0") && query.indexOf("@me") > -1) {
			query = query.replace(/@me/g, await this.getMe());
		}
		return super.query<T>(query, variables);
	}

	async createPullRequestReviewComment(request: {
		pullRequestId: string;
		pullRequestReviewId?: string;
		text: string;
		filePath?: string;
		position?: number;
	}) {
		const v = await this.getVersion();
		if (v && semver.lt(v, "2.21.0")) {
			// https://docs.github.com/en/enterprise-server@2.19/graphql/reference/input-objects#addpullrequestreviewcommentinput
			// https://docs.github.com/en/enterprise-server@2.20/graphql/reference/input-objects#addpullrequestreviewcommentinput
			let query;
			if (request.pullRequestReviewId) {
				query = `mutation AddPullRequestReviewComment($text:String!, $pullRequestId:ID!, $pullRequestReviewId:ID!, $filePath:String, $position:Int) {
					addPullRequestReviewComment(input: {body:$text, pullRequestId:$pullRequestId, pullRequestReviewId:$pullRequestReviewId, path:$filePath, position:$position}) {
					  clientMutationId
					}
				  }
				  `;
			} else {
				request.pullRequestReviewId = await this.getPullRequestReviewId(request);
				if (!request.pullRequestReviewId) {
					const result = await this.addPullRequestReview(request);
					if (result?.addPullRequestReview?.pullRequestReview?.id) {
						request.pullRequestReviewId = result.addPullRequestReview.pullRequestReview.id;
					}
				}
				query = `mutation AddPullRequestReviewComment($text:String!, $pullRequestReviewId:ID!, $filePath:String, $position:Int) {
					addPullRequestReviewComment(input: {body:$text, pullRequestReviewId:$pullRequestReviewId, path:$filePath, position:$position}) {
					  clientMutationId
					}
				  }
				  `;
				const response = await this.mutate<any>(query, request);
				return response;
			}
		} else {
			return super.createPullRequestReviewComment(request);
		}
	}

	async submitReview(request: {
		pullRequestId: string;
		text: string;
		eventType: string;
		// used with old servers
		pullRequestReviewId?: string;
	}) {
		if (!request.eventType) {
			request.eventType = "COMMENT";
		}
		if (
			request.eventType !== "COMMENT" &&
			request.eventType !== "APPROVE" &&
			// for some reason I cannot get DISMISS to work...
			// request.eventType !== "DISMISS" &&
			request.eventType !== "REQUEST_CHANGES"
		) {
			throw new Error("Invalid eventType");
		}

		let response;
		const v = await this.getVersion();
		if (v && semver.lt(v, "2.21.0")) {
			// https://docs.github.com/en/enterprise-server@2.19/graphql/reference/input-objects#submitpullrequestreviewinput
			// https://docs.github.com/en/enterprise-server@2.20/graphql/reference/input-objects#submitpullrequestreviewinput
			const existingReview = await this.getPendingReview(request);
			if (!existingReview) {
				const result = await this.addPullRequestReview(request);
				request.pullRequestReviewId = result?.addPullRequestReview?.pullRequestReview?.id;
			} else {
				request.pullRequestReviewId = existingReview.pullRequestReviewId;
			}
			const query = `mutation SubmitPullRequestReview($pullRequestReviewId:ID!, $body:String) {
			submitPullRequestReview(input: {event: ${request.eventType}, body: $body, pullRequestReviewId: $pullRequestReviewId}){
			  clientMutationId
			}
		  }
		  `;
			response = await this.mutate<any>(query, {
				pullRequestReviewId: request.pullRequestReviewId,
				body: request.text
			});
		} else {
			// > 2.21.X works as the latest
			response = super.submitReview(request);
		}

		return response;
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
	node_id: string | undefined;
	number: number;
	title: string;
}
