"use strict";

import { URI } from "vscode-uri";
import { GitLabProvider } from "./gitlab";
import { GitRemoteLike } from "../git/gitService";
import { ProviderConfigurationData } from "../protocol/agent.protocol.providers";
import { log, lspProvider } from "../system";
import { toRepoName } from "../git/utils";

@lspProvider("gitlab_enterprise")
export class GitLabEnterpriseProvider extends GitLabProvider {
	get displayName() {
		return "GitLab Self-Managed";
	}

	get name() {
		return "gitlab_enterprise";
	}

	get apiPath() {
		return this.providerConfig.forEnterprise || this.providerConfig.isEnterprise ? "/api/v4" : "";
	}

	get headers() {
		// Certain GitLab self-managed servers do not accept
		// the Authorization header but rather use a PRIVATE-TOKEN
		// header. See https://docs.gitlab.com/ee/api/#oauth2-tokens
		// and https://docs.gitlab.com/11.11/ee/api/README.html
		return {
			"PRIVATE-TOKEN": this.accessToken!,
			"Content-Type": "application/json"
		};
	}

	getIsMatchingRemotePredicate() {
		const baseUrl = this._providerInfo?.data?.baseUrl || this.getConfig().host;
		const configDomain = baseUrl ? URI.parse(baseUrl).authority : "";
		return (r: GitRemoteLike) => configDomain !== "" && r.domain === configDomain;
	}

	get baseWebUrl() {
		const { host, apiHost, isEnterprise, forEnterprise } = this.providerConfig;
		let returnHost;
		if (isEnterprise) {
			returnHost = host;
		} else if (forEnterprise) {
			returnHost = this._providerInfo?.data?.baseUrl || host;
		} else {
			returnHost = `https://${apiHost}`;
		}
		return returnHost;
	}

	get baseUrl() {
		return `${this.baseWebUrl}${this.apiPath}`;
	}

	async ensureInitialized() {
		await super.ensureInitialized();
		await this.getVersion();
	}

	@log()
	async configure(request: ProviderConfigurationData) {
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

	protected getOwnerFromRemote(remote: string): { owner: string; name: string } {
		const uri = URI.parse(remote);
		const split = uri.path.split("/");

		// the project name is the last item
		let name = split.pop();
		// gitlab & enterprise can use project groups + subgroups
		const owner = split.filter(_ => _ !== "" && _ != null);
		if (name != null) {
			name = toRepoName(name);
		}

		// for special cases when there is a /gitlab/ subdirectory as part
		// of the installation, we ignore that part
		if (owner && owner[0] && owner[0].toLowerCase() === "gitlab") {
			owner.shift();
		}

		return {
			owner: owner.join("/"),
			name: name!
		};
	}
}
