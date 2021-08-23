"use strict";
import { MessageType } from "../api/apiProvider";
import {
	GetNewRelicDataRequest,
	GetNewRelicDataRequestType,
	GetNewRelicDataResponse,
	GetNewRelicErrorsInboxRequest,
	GetNewRelicErrorsInboxRequestType,
	GetNewRelicErrorsInboxResponse,
	NewRelicConfigurationData,
	ThirdPartyProviderConfig
} from "../protocol/agent.protocol";
import { CSMe, CSNewRelicProviderInfo } from "../protocol/api.protocol";
import { log, lspProvider } from "../system";
import { ThirdPartyIssueProviderBase } from "./provider";
import { GraphQLClient } from "graphql-request";
import { InternalError, ReportSuppressedMessages } from "../agentError";
import { Logger } from "../logger";
import { lspHandler } from "../system";
import { SessionContainer } from "../container";
import { CodeStreamSession } from "../session";

@lspProvider("newrelic")
export class NewRelicProvider extends ThirdPartyIssueProviderBase<CSNewRelicProviderInfo> {
	constructor(session: CodeStreamSession, config: ThirdPartyProviderConfig) {
		super(session, config);
	}

	get displayName() {
		return "New Relic";
	}

	get name() {
		return "newrelic";
	}

	get headers() {
		return {
			"Api-Key": this.accessToken!,
			"Content-Type": "application/json"
		};
	}

	get myUrl() {
		const usingEU =
			this._providerInfo && this._providerInfo.data && this._providerInfo.data.usingEU;
		if (usingEU) {
			return "https://api.eu.newrelic.com";
		} else {
			return "https://api.newrelic.com";
		}
	}

	get baseUrl() {
		return this.myUrl;
	}

	get graphQlBaseUrl() {
		return `${this.baseUrl}/graphql`;
	}

	protected async client(): Promise<GraphQLClient> {
		if (this._client === undefined) {
			const options: { [key: string]: any } = {};
			if (this._httpsAgent) {
				options.agent = this._httpsAgent;
			}
			this._client = new GraphQLClient(this.graphQlBaseUrl, options);
		}
		if (!this.accessToken) {
			throw new Error("Could not get a New Relic API key");
		}

		// set accessToken on a per-usage basis... possible for accessToken
		// to be revoked from the source (github.com) and a stale accessToken
		// could be cached in the _client instance.
		this._client.setHeaders({
			"Api-Key": this.accessToken!,
			"Content-Type": "application/json"
		});

		return this._client;
	}

	@log()
	async configure(request: NewRelicConfigurationData) {
		await this.session.api.setThirdPartyProviderToken({
			providerId: this.providerConfig.id,
			token: request.apiKey,
			data: {
				accountId: request.accountId
			}
		});

		// FIXME - this rather sucks as a way to ensure we have the access token
		return new Promise<void>(resolve => {
			this.session.api.onDidReceiveMessage(e => {
				if (e.type !== MessageType.Users) return;

				const me = e.data.find((u: any) => u.id === this.session.userId) as CSMe | null | undefined;
				if (me == null) return;

				const providerInfo = this.getProviderInfo(me);
				if (providerInfo == null || !providerInfo.accessToken) return;

				resolve();
			});
		});
	}

	async query<T = any>(query: string, variables: any = undefined) {
		await this.ensureConnected();

		if (this._providerInfo && this._providerInfo.tokenError) {
			delete this._client;
			throw new InternalError(ReportSuppressedMessages.AccessTokenInvalid);
		}

		let response: any;
		try {
			response = await (await this.client()).request<T>(query, variables);
		} catch (ex) {
			Logger.warn(`New Relic query caught:`, ex);
			const exType = this._isSuppressedException(ex);
			if (exType !== undefined) {
				this.trySetThirdPartyProviderInfo(ex, exType);

				// this throws the error but won't log to sentry (for ordinary network errors that seem temporary)
				throw new InternalError(exType, { error: ex });
			} else {
				// this is an unexpected error, throw the exception normally
				throw ex;
			}
		}

		return response;
	}

	@lspHandler(GetNewRelicDataRequestType)
	async getNewRelicData(request: GetNewRelicDataRequest): Promise<GetNewRelicDataResponse> {
		try {
			await this.ensureConnected();
			const accountId = this._providerInfo?.data?.accountId;
			if (!accountId) {
				throw new Error("must provide an accountId");
			}
			// !!! NEED ESCAPING HERE !!!!
			const query = `
{
	actor {
		account(id:${accountId}) {
			nrql(query: "${request.query}") {
				results
			}
		}
	}
}
`;
			//{"query":"{  actor {    account(id: ${accountId}) {    nrql(query: \"${request.query}\") {        results     }    }  }}", "variables":""}`;
			const response = await this.query(query);
			const results = response?.actor?.account?.nrql?.results;
			if (results) {
				return { data: results as GetNewRelicDataResponse };
			} else {
				Logger.warn("Invalid NRQL results:", results);
				throw new Error("Invalid NRQL results");
			}
		} catch (ex) {
			return { data: {} };
		}
	}

	@lspHandler(GetNewRelicErrorsInboxRequestType)
	@log()
	async getNewRelicErrorsInboxData(
		request: GetNewRelicErrorsInboxRequest
	): Promise<GetNewRelicErrorsInboxResponse | undefined> {
		try {
			// TODO this is all mocked from the protocol url -- need to actually hit NR here
			const route = request.route;
			const { repo, sha } = JSON.parse(route.query.customAttributes);
			const parsedStack: string[] = route.query.stack ? JSON.parse(route.query.stack) : [];

			return {
				repo,
				sha,
				parsedStack
			};
		} catch (ex) {
			return undefined;
		}
	}
}
