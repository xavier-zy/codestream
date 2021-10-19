"use strict";
import { GraphQLClient } from "graphql-request";
import {
	memoize,
	groupBy as _groupBy,
	sortBy as _sortBy,
	flatten as _flatten,
	uniq as _uniq,
	uniqBy as _uniqBy
} from "lodash-es";
import { ResponseError } from "vscode-jsonrpc/lib/messages";
import { URI } from "vscode-uri";
import { InternalError, ReportSuppressedMessages } from "../agentError";
import { SessionContainer } from "../container";
import { GitRemoteParser } from "../git/parsers/remoteParser";
import { Logger } from "../logger";
import {
	EntityAccount,
	EntitySearchResponse,
	ERROR_NR_CONNECTION_INVALID_API_KEY,
	ERROR_NR_CONNECTION_MISSING_API_KEY,
	ERROR_NR_CONNECTION_MISSING_URL,
	ERROR_PIXIE_NOT_CONFIGURED,
	ErrorGroupResponse,
	ErrorGroupsResponse,
	GetNewRelicAccountsRequestType,
	GetNewRelicAccountsResponse,
	GetNewRelicAssigneesRequestType,
	GetNewRelicErrorGroupRequest,
	GetNewRelicErrorGroupRequestType,
	GetNewRelicErrorGroupResponse,
	GetObservabilityEntitiesRequest,
	GetObservabilityEntitiesRequestType,
	GetObservabilityEntitiesResponse,
	GetObservabilityErrorAssignmentsRequest,
	GetObservabilityErrorAssignmentsRequestType,
	GetObservabilityErrorAssignmentsResponse,
	GetObservabilityErrorGroupMetadataRequest,
	GetObservabilityErrorGroupMetadataRequestType,
	GetObservabilityErrorGroupMetadataResponse,
	GetObservabilityErrorsRequest,
	GetObservabilityErrorsRequestType,
	GetObservabilityErrorsResponse,
	GetObservabilityReposRequest,
	GetObservabilityReposRequestType,
	GetObservabilityReposResponse,
	NewRelicConfigurationData,
	NewRelicErrorGroup,
	ObservabilityError,
	ObservabilityErrorCore,
	RelatedEntity,
	ReposScm,
	ThirdPartyDisconnect,
	ThirdPartyProviderConfig,
	Entity,
	StackTraceResponse,
	ErrorGroupStateType,
	BuiltFromResult
} from "../protocol/agent.protocol";
import { CSNewRelicProviderInfo } from "../protocol/api.protocol";
import { CodeStreamSession } from "../session";
import { log, lspHandler, lspProvider } from "../system";
import { Strings } from "../system/string";
import { ThirdPartyIssueProviderBase } from "./provider";

export interface Directive {
	type: "assignRepository" | "removeAssignee" | "setAssignee" | "setState";
	data: any;
}

interface Directives {
	directives: Directive[];
}

interface NewRelicId {
	accountId: number;
	unknownAbbreviation: string;
	entityType: string;
	unknownGuid: string;
}

interface NewRelicEntity {
	guid: string;
	name: string;
	tags: { key: string; values: string[] }[];
	type: string;
}

const MetricsLookupBackoffs = [
	{
		// short lived data lives in MetricRaw
		table: "MetricRaw",
		since: "10 minutes"
	},
	{
		table: "Metric",
		since: "3 day"
	},
	{
		table: "Metric",
		since: "7 day"
	},
	{
		table: "Metric",
		since: "180 day"
	},
	{
		table: "Metric",
		since: "365 day"
	}
];

class AccessTokenError extends Error {
	constructor(public text: string, public innerError: any, public isAccessTokenError: boolean) {
		super(text);
	}
}

@lspProvider("newrelic")
export class NewRelicProvider extends ThirdPartyIssueProviderBase<CSNewRelicProviderInfo> {
	private _newRelicUserId: number | undefined = undefined;
	private _memoizedBuildRepoRemoteVariants: any;

	constructor(session: CodeStreamSession, config: ThirdPartyProviderConfig) {
		super(session, config);
		this._memoizedBuildRepoRemoteVariants = memoize(
			this.buildRepoRemoteVariants,
			(remotes: string[]) => remotes
		);
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

	get apiUrl() {
		const data = this._providerInfo && this._providerInfo.data;
		return this.getApiUrlCore(data);
	}

	private getApiUrlCore(data?: { apiUrl?: string; usingEU?: boolean; [key: string]: any }): string {
		if (data) {
			if (data.apiUrl) {
				return Strings.trimEnd(data.apiUrl, "/").toLowerCase();
			}
			if (data.usingEU) {
				return "https://api.eu.newrelic.com";
			}
		}
		return "https://api.newrelic.com";
	}

	get productUrl() {
		return this.apiUrl.replace("api", "one");
	}

	get baseUrl() {
		return this.apiUrl;
	}

	get graphQlBaseUrl() {
		return `${this.baseUrl}/graphql`;
	}

	@log()
	async onDisconnected(request?: ThirdPartyDisconnect) {
		// delete the graphql client so it will be reconstructed if a new token is applied
		delete this._client;
		delete this._newRelicUserId;
		super.onDisconnected(request);
	}

	protected async client(): Promise<GraphQLClient> {
		const client =
			this._client || (this._client = this.createClient(this.graphQlBaseUrl, this.accessToken));
		client.setHeaders({
			"Api-Key": this.accessToken!,
			"Content-Type": "application/json",
			"NewRelic-Requesting-Services": "CodeStream"
		});
		return client;
	}

	protected createClient(graphQlBaseUrl?: string, accessToken?: string): GraphQLClient {
		if (!graphQlBaseUrl) {
			throw new ResponseError(ERROR_NR_CONNECTION_MISSING_URL, "Could not get a New Relic API URL");
		}
		if (!accessToken) {
			throw new ResponseError(
				ERROR_NR_CONNECTION_MISSING_API_KEY,
				"Could not get a New Relic API key"
			);
		}
		const options: { [key: string]: any } = {};
		if (this._httpsAgent) {
			options.agent = this._httpsAgent;
		}
		const client = new GraphQLClient(graphQlBaseUrl, options);

		// set accessToken on a per-usage basis... possible for accessToken
		// to be revoked from the source (github.com) and a stale accessToken
		// could be cached in the _client instance.
		client.setHeaders({
			"Api-Key": accessToken!,
			"Content-Type": "application/json",
			"NewRelic-Requesting-Services": "CodeStream"
		});

		return client;
	}

	@log()
	async configure(request: NewRelicConfigurationData) {
		// FIXME - this rather sucks as a way to ensure we have the access token
		// const userPromise = new Promise<void>(resolve => {
		// 	this.session.api.onDidReceiveMessage(e => {
		// 		if (e.type !== MessageType.Users) return;
		//
		// 		const me = e.data.find((u: any) => u.id === this.session.userId) as CSMe | null | undefined;
		// 		if (me == null) return;
		//
		// 		const providerInfo = this.getProviderInfo(me);
		// 		if (providerInfo == null || !providerInfo.accessToken) return;
		//
		// 		resolve();
		// 	});
		// });
		const client = this.createClient(
			this.getApiUrlCore({ apiUrl: request.apiUrl }) + "/graphql",
			request.apiKey
		);
		const { userId, accounts } = await this.validateApiKey(client);
		Logger.log(`Found ${accounts.length} New Relic accounts`);
		const response = await this.session.api.lookupNewRelicOrganizations({
			accountIds: accounts.map(_ => _.id)
		});
		Logger.log(`Found ${response.length} associated New Relic organizations`);
		await this.session.api.setThirdPartyProviderToken({
			providerId: this.providerConfig.id,
			token: request.apiKey,
			data: {
				userId,
				accountId: request.accountId,
				apiUrl: request.apiUrl,
				orgIds: response.map(_ => _.orgId)
			}
		});
	}

	private async validateApiKey(
		client: GraphQLClient
	): Promise<{
		userId: number;
		organizationId?: number;
		accounts: any[];
	}> {
		try {
			const response = await client.request<{
				actor: {
					user: {
						id: number;
					};
					organization?: {
						id: number;
					};
					accounts: [
						{
							id: number;
							name: string;
						}
					];
				};
			}>(`{
				actor {
					user {
						id
					}
					accounts {
						id,
						name
					}
				}
			}`);
			return {
				userId: response.actor.user.id,
				accounts: response.actor.accounts,
				organizationId: response.actor.organization?.id
			};
		} catch (ex) {
			const accessTokenError = this.getAccessTokenError(ex);
			throw new ResponseError(
				ERROR_NR_CONNECTION_INVALID_API_KEY,
				accessTokenError?.message || ex.message || ex.toString()
			);
		}
	}

	async mutate<T>(query: string, variables: any = undefined) {
		await this.ensureConnected();

		return (await this.client()).request<T>(query, variables);
	}

	async query<T = any>(query: string, variables: any = undefined): Promise<T> {
		await this.ensureConnected();

		if (this._providerInfo && this._providerInfo.tokenError) {
			delete this._client;
			throw new InternalError(ReportSuppressedMessages.AccessTokenInvalid);
		}

		let response: any;
		try {
			response = await (await this.client()).request<T>(query, variables);
		} catch (ex) {
			Logger.warn(`NR: query caught:`, ex);
			const exType = this._isSuppressedException(ex);
			if (exType !== undefined) {
				// this throws the error but won't log to sentry (for ordinary network errors that seem temporary)
				throw new InternalError(exType, { error: ex });
			} else {
				const accessTokenError = this.getAccessTokenError(ex);
				if (accessTokenError) {
					throw new AccessTokenError(accessTokenError.message, ex, true);
				}

				// this is an unexpected error, throw the exception normally
				throw ex;
			}
		}

		return response;
	}

	private getAccessTokenError(ex: any): { message: string } | undefined {
		let requestError = ex as {
			response: {
				errors: {
					extensions: {
						error_code: string;
					};
					message: string;
				}[];
			};
		};
		if (
			requestError &&
			requestError.response &&
			requestError.response.errors &&
			requestError.response.errors.length
		) {
			return requestError.response.errors.find(
				_ => _.extensions && _.extensions.error_code === "BAD_API_KEY"
			);
		}
		return undefined;
	}

	private _applicationEntitiesCache: GetObservabilityEntitiesResponse | undefined = undefined;

	@lspHandler(GetObservabilityEntitiesRequestType)
	@log({
		timed: true
	})
	async getEntities(
		request: GetObservabilityEntitiesRequest
	): Promise<GetObservabilityEntitiesResponse> {
		try {
			if (this._applicationEntitiesCache != null) {
				Logger.debug("NR: query entities (from cache)");
				return this._applicationEntitiesCache;
			}

			let results: { guid: string; name: string }[] = [];
			let nextCursor: any = undefined;
			// let i = 0;
			//	while (true) {

			if (request.appName != null) {
				// try to find the entity based on the app / remote name
				const response = await this.query<any>(
					`query  {
				actor {
				  entitySearch(query: "type='APPLICATION' and name LIKE '${Strings.sanitizeGraphqlValue(
						request.appName
					)}'", sortBy:MOST_RELEVANT) { 
					results {			 
					  entities {					
						guid
						name
					  }
					}
				  }
				}
			  }`
				);

				results = results.concat(
					response.actor.entitySearch.results.entities.map((_: any) => {
						return {
							guid: _.guid,
							name: _.name
						};
					})
				);
			}

			const response = await this.query<any>(
				`query search($cursor:String) {
			actor {
			  entitySearch(query: "type='APPLICATION'", sortBy:MOST_RELEVANT) { 
				results(cursor:$cursor) {
				 nextCursor
				  entities {					
					guid
					name
				  }
				}
			  }
			}
		  }`,
				{
					cursor: nextCursor
				}
			);

			results = results.concat(
				response.actor.entitySearch.results.entities.map((_: any) => {
					return {
						guid: _.guid,
						name: _.name
					};
				})
			);
			// nextCursor = response.actor.entitySearch.results.nextCursor;
			// i++;
			// if (!nextCursor) {
			// 	break;
			// } else {
			// 	Logger.log("NR: query entities ", {
			// 		i: i
			// 	});
			// }
			//	}
			results.sort((a, b) => a.name.localeCompare(b.name));

			results = [...new Map(results.map(item => [item["guid"], item])).values()];
			this._applicationEntitiesCache = {
				entities: results
			};
			return {
				entities: results
			};
		} catch (ex) {
			Logger.error(ex, "NR: getEntities");
		}
		return {
			entities: []
		};
	}

	@lspHandler(GetObservabilityErrorGroupMetadataRequestType)
	@log({
		timed: true
	})
	async getErrorGroupMetadata(
		request: GetObservabilityErrorGroupMetadataRequest
	): Promise<GetObservabilityErrorGroupMetadataResponse | undefined> {
		if (!request.errorGroupGuid) return undefined;

		try {
			const metricResponse = await this.getMetricData(request.errorGroupGuid);
			if (!metricResponse) return undefined;

			const mappedEntity = await this.findMappedRemoteByEntity(metricResponse?.entityGuid);
			return {
				entityId: metricResponse?.entityGuid,
				occurrenceId: metricResponse?.traceId,
				remote: mappedEntity?.url
			} as GetObservabilityErrorGroupMetadataResponse;
		} catch (ex) {
			Logger.error(ex, "NR: getErrorGroupMetadata", {
				request: request
			});
		}
		return undefined;
	}

	@lspHandler(GetObservabilityErrorAssignmentsRequestType)
	@log({
		timed: true
	})
	async getObservabilityErrorAssignments(request: GetObservabilityErrorAssignmentsRequest) {
		const response: GetObservabilityErrorAssignmentsResponse = { items: [] };

		try {
			const { users } = SessionContainer.instance();
			const me = await users.getMe();

			const result = await this.getErrorsInboxAssignments(me.user.email);
			if (result) {
				response.items = result.actor.errorsInbox.errorGroups.results
					.filter(_ => {
						// dont show IGNORED or RESOLVED errors
						return !_.state || _.state === "UNRESOLVED";
					})
					.map((_: any) => {
						return {
							entityId: _.entityGuid,
							errorGroupGuid: _.id,
							errorClass: _.name,
							message: _.message,
							errorGroupUrl: _.url
						} as ObservabilityErrorCore;
					});

				if (response.items && response.items.find(_ => !_.errorClass)) {
					Logger.warn("NR: getObservabilityErrorAssignments has empties", {
						items: response.items
					});
				}
				Logger.warn("NR: getObservabilityErrorAssignments", {
					itemsCount: response.items.length
				});
			} else {
				Logger.log("NR: getObservabilityErrorAssignments (none)");
			}
		} catch (ex) {
			Logger.warn("NR: getObservabilityErrorAssignments", {
				error: ex
			});
		}

		return response;
	}

	@lspHandler(GetObservabilityReposRequestType)
	@log({
		timed: true
	})
	async getObservabilityRepos(request: GetObservabilityReposRequest) {
		const response: GetObservabilityReposResponse = { repos: [] };
		try {
			const { scm } = SessionContainer.instance();
			const reposResponse = await scm.getRepos({ inEditorOnly: true, includeRemotes: true });
			let filteredRepos: ReposScm[] | undefined = reposResponse?.repositories;
			if (request?.filters?.length) {
				const repoIds = request.filters.map(_ => _.repoId);
				filteredRepos = reposResponse.repositories?.filter(r => r.id && repoIds.includes(r.id))!;
			}

			filteredRepos = filteredRepos?.filter(_ => _.id);
			if (!filteredRepos || !filteredRepos.length) return response;

			for (const repo of filteredRepos) {
				if (!repo.id || !repo.remotes || !repo.remotes.length) {
					Logger.warn(
						"NR: getObservabilityRepos skipping repo with missing id and/or repo.remotes",
						{
							repo: repo
						}
					);
					continue;
				}
				const folderName = this.getRepoName(repo.folder);
				let remotes: string[] = [];
				for (const remote of repo.remotes) {
					if (remote.name === "origin" || remote.remoteWeight === 0) {
						// this is the origin remote
						remotes = [remote.uri.toString().replace("ssh://", "")];
						break;
					} else {
						remotes.push(remote.uri.toString());
					}
				}

				const repositoryEntitiesResponse = await this.findRepositoryEntitiesByRepoRemotes(remotes);
				let remoteUrls: (string | undefined)[] = [];
				let hasRepoAssociation;
				if (repositoryEntitiesResponse?.entities) {
					const entitiesReponse = await this.findRelatedEntityByRepositoryGuids(
						repositoryEntitiesResponse?.entities?.map(_ => _.guid)
					);
					const applicationAssociation = entitiesReponse?.actor?.entities?.filter(
						_ =>
							_.relatedEntities?.results?.filter(r => r.source?.entity?.type === "APPLICATION")
								.length
					);
					hasRepoAssociation = applicationAssociation?.length > 0;

					// find all the unique remotes in all the entities found
					remoteUrls = _uniq(
						_flatten(
							repositoryEntitiesResponse.entities.map(_ => {
								return _.tags?.find(t => t.key === "url")?.values;
							})
						)
					).filter(Boolean);
					Logger.log("NR: found entities matching remotes", {
						remotes: remotes,
						entities: repositoryEntitiesResponse?.entities?.map(_ => {
							return { guid: _.guid, name: _.name };
						})
					});
				}

				let remote = "";
				if (remoteUrls && remoteUrls[0]) {
					if (remoteUrls.length > 1) {
						// if for some reason we have > 1 (user has bad remotes, or remotes that point to other places WITH entity mappings)
						Logger.warn("");
						Logger.warn("NR: getEntitiesByRepoRemote FOUND MORE THAN 1 UNIQUE REMOTE", {
							remotes: remotes,
							entityRemotes: remoteUrls
						});
						Logger.warn("");
					}
					remote = remoteUrls[0];
				} else {
					remote = remotes[0];
				}

				let uniqueEntities: Entity[] = [];
				if (repositoryEntitiesResponse && repositoryEntitiesResponse.entities) {
					for (const entity of repositoryEntitiesResponse.entities) {
						const tags = entity.tags;
						if (!tags) continue;

						const accountIdTag = entity.tags!.find(_ => _.key === "accountId");
						if (!accountIdTag) continue;

						uniqueEntities.push({
							account: {
								id: parseInt(accountIdTag.values[0] || "0", 10),
								name: entity.tags!.find(_ => _.key === "account")?.values[0] || "Account"
							},
							guid: entity.guid,
							name: entity.name
						});
					}
				}
				response.repos.push({
					repoId: repo.id!,
					repoName: folderName,
					repoRemote: remote,
					hasRepoAssociation: hasRepoAssociation,
					// @ts-ignore
					entityAccounts: uniqueEntities
						.map(entity => {
							return {
								accountId: entity.account?.id,
								accountName: entity.account?.name || "Account",
								entityGuid: entity.guid,
								entityName: entity.name
							} as EntityAccount;
						})
						.filter(Boolean)
				});
				Logger.log(`NR: getObservabilityRepos hasRepoAssociation=${hasRepoAssociation}`, {
					repoId: repo.id,
					entities: repositoryEntitiesResponse?.entities?.map(_ => _.guid)
				});
			}
		} catch (ex) {
			Logger.error(ex, "NR: getObservabilityRepos");
		}

		return response;
	}

	@lspHandler(GetObservabilityErrorsRequestType)
	@log({
		timed: true
	})
	async getObservabilityErrors(request: GetObservabilityErrorsRequest) {
		const response: GetObservabilityErrorsResponse = { repos: [] };
		try {
			// NOTE: might be able to eliminate some of this if we can get a list of entities
			const { scm } = SessionContainer.instance();
			const reposResponse = await scm.getRepos({ inEditorOnly: true, includeRemotes: true });
			let filteredRepos: ReposScm[] | undefined = reposResponse?.repositories;
			if (request?.filters?.length) {
				const repoIds = request.filters.map(_ => _.repoId);
				filteredRepos = reposResponse.repositories?.filter(r => r.id && repoIds.includes(r.id))!;
			}
			filteredRepos = filteredRepos?.filter(_ => _.id);

			if (!filteredRepos || !filteredRepos.length) return response;

			for (const repo of filteredRepos) {
				if (!repo.remotes) continue;

				const observabilityErrors: ObservabilityError[] = [];
				const remotes = repo.remotes.map(_ => {
					return (_ as any).uri!.toString();
				});

				const repositoryEntitiesResponse = await this.findRepositoryEntitiesByRepoRemotes(remotes);
				if (repositoryEntitiesResponse?.entities?.length) {
					const entityFilter = request.filters?.find(_ => _.repoId === repo.id!);
					let filteredEntities = repositoryEntitiesResponse.entities.filter((_, index) =>
						entityFilter && entityFilter.entityGuid
							? _.guid === entityFilter.entityGuid
							: index == 0
					);
					if (entityFilter && entityFilter.entityGuid && !filteredEntities.length) {
						filteredEntities = repositoryEntitiesResponse.entities.filter((r, i) => i === 0);
						Logger.warn("NR: getObservabilityErrors bad entityGuid passed", {
							entityGuid: entityFilter.entityGuid
						});
					}
					for (const entity of filteredEntities) {
						const accountIdTag = entity.tags?.find(_ => _.key === "accountId");
						if (!accountIdTag) {
							Logger.warn("NR: count not find accountId for entity", {
								entityGuid: entity.guid
							});
							continue;
						}

						const accountIdValue = parseInt(accountIdTag.values[0] || "0", 10);
						const urlTag = entity.tags?.find(_ => _.key === "url");
						const urlValue = urlTag?.values[0];

						const related = await this.findRelatedEntityByRepositoryGuid(entity.guid);
						const applicationGuid = related.actor.entity.relatedEntities.results.find(
							(r: any) => r.type === "BUILT_FROM"
						)?.source.entity.guid;

						if (!applicationGuid) continue;

						const response = await this.findFingerprintedErrorTraces(
							accountIdValue,
							applicationGuid
						);
						if (response.actor.account.nrql.results) {
							const groupedByFingerprint = _groupBy(
								response.actor.account.nrql.results,
								"fingerprint"
							);
							const errorTraces = [];
							for (const k of Object.keys(groupedByFingerprint)) {
								const groupedObject = _sortBy(groupedByFingerprint[k], r => -r.timestamp);
								const lastObject = groupedObject[0];
								errorTraces.push({
									fingerPrintId: k,
									length: groupedObject.length,
									appName: lastObject.appName,
									lastOccurrence: lastObject.timestamp,
									occurrenceId: lastObject.id,
									errorClass: lastObject["error.class"],
									message: lastObject.message,
									entityGuid: lastObject.entityGuid
								});
							}

							for (const errorTrace of errorTraces) {
								try {
									const response = await this.getErrorGroupFromNameMessageEntity(
										errorTrace.errorClass,
										errorTrace.message,
										errorTrace.entityGuid
									);

									if (response && response.actor.errorsInbox.errorGroup) {
										observabilityErrors.push({
											entityId: errorTrace.entityGuid,
											appName: errorTrace.appName,
											errorClass: errorTrace.errorClass,
											message: errorTrace.message,
											remote: urlValue!,
											errorGroupGuid: response.actor.errorsInbox.errorGroup.id,
											occurrenceId: errorTrace.occurrenceId,
											count: errorTrace.length,
											lastOccurrence: errorTrace.lastOccurrence,
											errorGroupUrl: response.actor.errorsInbox.errorGroup.url
										});
										if (observabilityErrors.length > 4) {
											break;
										}
									}
								} catch (ex) {
									Logger.warn("NR: internal error getErrorGroupGuid", {
										ex: ex
									});
								}
							}
						}
					}
				} else {
				}
				response.repos.push({
					repoId: repo.id!,
					repoName: this.getRepoName(repo.folder),
					errors: observabilityErrors!
				});
			}
		} catch (ex) {
			Logger.error(ex, "getObservabilityErrors");
		}
		return response as any;
	}

	@log()
	async getPixieToken(accountId: number) {
		try {
			const response = await this.query(
				`query fetchPixieAccessToken($accountId:Int!) {
  					actor {
    					account(id: $accountId) {
      						pixie {
        						pixieAccessToken
      						}
						}
  					}
				}
			  	`,
				{
					accountId: accountId
				}
			);
			const token = response.actor.account.pixie.pixieAccessToken;

			if (token == null) {
				throw new ResponseError(ERROR_PIXIE_NOT_CONFIGURED, "Unable to fetch Pixie token");
			}

			return token;
		} catch (e) {
			Logger.error(e);
			throw new ResponseError(ERROR_PIXIE_NOT_CONFIGURED, e.message || e.toString());
		}
	}

	@lspHandler(GetNewRelicAccountsRequestType)
	@log()
	async getAccounts(): Promise<GetNewRelicAccountsResponse> {
		try {
			const response = await this.query<{
				actor: {
					accounts: { id: number; name: string }[];
				};
			}>(`{
				actor {
					accounts {
						id,
						name
					}
				}
			}`);
			return response.actor;
		} catch (e) {
			Logger.error(e, "NR: getAccounts");
			throw e;
		}
	}

	@lspHandler(GetNewRelicErrorGroupRequestType)
	@log()
	async getNewRelicErrorGroupData(
		request: GetNewRelicErrorGroupRequest
	): Promise<GetNewRelicErrorGroupResponse | undefined> {
		let errorGroup: NewRelicErrorGroup | undefined = undefined;
		let accountId = 0;
		let entityGuid: string = "";
		try {
			const errorGroupGuid = request.errorGroupGuid;
			const parsedId = this.parseId(errorGroupGuid)!;
			accountId = parsedId.accountId;

			// we're going to attempt to run these in parallel
			// if we have an entityGuid in the request
			let metricsResponse;
			let errorGroupResponse;

			let inParallel = false;
			if (request.entityGuid) {
				entityGuid = request.entityGuid;
				[metricsResponse, errorGroupResponse] = await Promise.all([
					this.fetchMetricsData(accountId, errorGroupGuid),
					this.fetchErrorGroup(errorGroupGuid, entityGuid, request.occurrenceId)
				]);
				inParallel = true;
			} else {
				metricsResponse = await this.fetchMetricsData(accountId, errorGroupGuid);
			}
			Logger.debug(`NR: getNewRelicErrorGroupData inParallel=${inParallel}`);

			if (metricsResponse) {
				entityGuid = metricsResponse["entity.guid"];
				errorGroup = {
					entity: {},
					accountId: accountId,
					entityGuid: entityGuid,
					guid: metricsResponse["error.group.guid"],
					title: metricsResponse["error.group.name"],
					message: metricsResponse["error.group.message"],
					source: metricsResponse["error.group.source"],
					timestamp: metricsResponse["timestamp"],
					errorGroupUrl: `${this.productUrl}/redirect/errors-inbox/${errorGroupGuid}`,
					entityUrl: `${this.productUrl}/redirect/entity/${metricsResponse["entity.guid"]}`
				};

				errorGroup.attributes = {
					Timestamp: { type: "timestamp", value: errorGroup.timestamp }
					// TODO fix me
					// "Host display name": { type: "string", value: "11.11.11.11:11111" },
					// "URL host": { type: "string", value: "value" },
					// "URL path": { type: "string", value: "value" }
				};

				if (!inParallel) {
					errorGroupResponse = await this.fetchErrorGroup(
						errorGroupGuid,
						entityGuid,
						request.occurrenceId
					);
				}

				if (errorGroupResponse) {
					let states;
					if (errorGroupResponse.actor.errorsInbox.errorGroupStateTypes) {
						states = errorGroupResponse.actor.errorsInbox.errorGroupStateTypes.map(
							(_: ErrorGroupStateType) => _.type
						);
					}
					errorGroup.states =
						states && states.length ? states : ["UNRESOLVED", "RESOLVED", "IGNORED"];
					errorGroup.errorGroupUrl = errorGroupResponse.actor.errorsInbox.errorGroup.url;
					errorGroup.entityName = errorGroupResponse.actor.entity.name;
					errorGroup.entityAlertingSeverity = errorGroupResponse.actor.entity.alertSeverity;
					errorGroup.state = errorGroupResponse.actor.errorsInbox.errorGroup.state || "UNRESOLVED";

					const assignee = errorGroupResponse.actor.errorsInbox.errorGroup.assignment;
					if (assignee) {
						errorGroup.assignee = {
							email: assignee.email,
							id: assignee.userInfo?.id,
							name: assignee.userInfo?.name,
							gravatar: assignee.userInfo?.gravatar
						};
					}

					const builtFromResult = this.findBuiltFrom(
						errorGroupResponse.actor.entity.relatedEntities.results
					);
					if (errorGroup.entity && builtFromResult) {
						if (builtFromResult.error) {
							errorGroup.entity.relationship = {
								error: builtFromResult.error
							};
						} else {
							errorGroup.entity = {
								repo: {
									name: builtFromResult.name!,
									urls: [builtFromResult.url!]
								}
							};
						}
					}

					if (errorGroupResponse.actor?.entity?.exception?.stackTrace) {
						errorGroup.errorTrace = {
							path: errorGroupResponse.actor.entity.name,
							stackTrace: errorGroupResponse.actor.entity.crash
								? errorGroupResponse.actor.entity.crash.stackTrace.frames
								: errorGroupResponse.actor.entity.exception.stackTrace.frames
						};
						errorGroup.hasStackTrace = true;
					}
				}

				Logger.log("NR: ErrorGroup found", {
					errorGroupGuid: errorGroup.guid,
					occurrenceId: request.occurrenceId,
					entityGuid: entityGuid,
					hasErrorGroup: errorGroup != null,
					hasStackTrace: errorGroup?.hasStackTrace === true
				});
			} else {
				Logger.warn(
					`NR: No errorGroup results errorGroupGuid (${errorGroupGuid}) in account (${accountId})`,
					{
						request: request,
						entityGuid: entityGuid,
						accountId: accountId
					}
				);
				return {
					accountId: accountId,
					error: {
						message: `Could not find error info for that errorGroupGuid in account (${accountId})`,
						details: (await this.buildErrorDetailSettings(
							accountId,
							entityGuid,
							errorGroupGuid
						)) as any
					}
				};
			}

			return {
				accountId,
				errorGroup
			};
		} catch (ex) {
			Logger.error(ex);

			let result: any = {};
			if (ex.response?.errors) {
				result = {
					message: ex.response.errors.map((_: { message: string }) => _.message).join("\n")
				};
			} else {
				result = { message: ex.message ? ex.message : ex.toString() };
			}

			result.details = (await this.buildErrorDetailSettings(
				accountId,
				entityGuid,
				request.errorGroupGuid
			)) as any;

			return {
				error: result,
				accountId,
				errorGroup: undefined as any
			};
		}
	}

	@lspHandler(GetNewRelicAssigneesRequestType)
	@log()
	async getAssignableUsers(request: { boardId: string }) {
		const { scm } = SessionContainer.instance();
		const committers = await scm.getLatestCommittersAllRepos();
		let users: any[] = [];
		if (committers?.scm) {
			users = users.concat(
				Object.keys(committers.scm).map((_: string) => {
					return {
						id: _,
						email: _,
						group: "GIT"
					};
				})
			);
		}

		// TODO fix me get users from NR

		// users.push({
		// 	id: "123",
		// 	displayName: "Some One",
		// 	email: "someone@newrelic.com",
		// 	avatarUrl: "http://...",
		// 	group: "NR"
		// });

		return {
			users: users
		};
	}

	@log()
	async setAssignee(request: {
		errorGroupGuid: string;
		emailAddress: string;
	}): Promise<Directives | undefined> {
		try {
			const response = await this.setAssigneeByEmail(request!);
			const assignment = response.errorsInboxAssignErrorGroup.assignment;
			// won't be a userInfo object if assigning by email

			return {
				directives: [
					{
						type: "setAssignee",
						data: {
							assignee: {
								email: assignment.email,
								id: assignment?.userInfo?.id,
								name: assignment?.userInfo?.name
							}
						}
					}
				]
			};
		} catch (ex) {
			Logger.error(ex);
			return undefined;
		}
	}

	@log()
	async removeAssignee(request: {
		errorGroupGuid: string;
		emailAddress?: string;
		userId?: string;
	}): Promise<Directives | undefined> {
		try {
			await this.setAssigneeByUserId({ ...request, userId: "0" });

			return {
				directives: [
					{
						type: "removeAssignee",
						data: {
							assignee: null
						}
					}
				]
			};
		} catch (ex) {
			Logger.error(ex);
			return undefined;
		}
	}

	@log()
	async setState(request: {
		errorGroupGuid: string;
		state: "RESOLVED" | "UNRESOLVED" | "IGNORED";
	}): Promise<Directives | undefined> {
		try {
			const response = await this.mutate<{
				errorTrackingUpdateErrorGroupState: {
					errors?: { description: string }[];
					state?: string;
				};
			}>(
				`mutation UpdateErrorGroupState($errorGroupGuid: ID!, $state: ErrorsInboxErrorGroupState!) {
					errorsInboxUpdateErrorGroupState(id: $errorGroupGuid, state: $state) {
					  state
					  errors {
						description
						type
					  }
					}
				  }
				  `,
				{
					errorGroupGuid: request.errorGroupGuid,
					state: request.state
				}
			);

			Logger.log("NR: errorsInboxUpdateErrorGroupState", {
				request: request,
				response: response
			});

			if (response?.errorTrackingUpdateErrorGroupState?.errors?.length) {
				const stateFailure = response.errorTrackingUpdateErrorGroupState.errors
					.map(_ => _.description)
					.join("\n");
				Logger.warn("NR: errorsInboxUpdateErrorGroupState failure", {
					error: stateFailure
				});
				throw new Error(stateFailure);
			}

			return {
				directives: [
					{
						type: "setState",
						data: {
							state: request.state
						}
					}
				]
			};
		} catch (ex) {
			Logger.error(ex as Error);
			throw ex;
		}
	}

	@log()
	async assignRepository(request: {
		/** this is a field that can be parsed to get an accountId */
		parseableAccountId: string;
		errorGroupGuid?: string;
		entityId?: string;
		name?: string;
		url: string;
	}): Promise<Directives | undefined> {
		try {
			const parsedId = this.parseId(request.parseableAccountId)!;
			const accountId = parsedId.accountId;
			const name = request.name;

			const response = await this.mutate<{
				referenceEntityCreateOrUpdateRepository: {
					created: string[];
					failures: {
						guid: string;
						message: string;
						type: string;
					}[];
				};
			}>(
				`mutation ReferenceEntityCreateOrUpdateRepository($accountId: Int!, $name: String!, $url: String!) {
					referenceEntityCreateOrUpdateRepository(repositories: [{accountId: $accountId, name: $name, url: $url}]) {
					  created
					  failures {
						guid
						message
						type
					  }
					}
				  }
			  `,
				{
					accountId: accountId,
					name: name,
					url: request.url
				}
			);
			Logger.log("NR: referenceEntityCreateOrUpdateRepository", {
				accountId: accountId,
				name: name,
				url: request.url,
				response: response
			});

			if (response?.referenceEntityCreateOrUpdateRepository?.failures?.length) {
				const failures = response.referenceEntityCreateOrUpdateRepository.failures
					.map(_ => `${_.message} (${_.type})`)
					.join("\n");
				Logger.warn("NR: referenceEntityCreateOrUpdateRepository failures", {
					accountId: accountId,
					name: name,
					url: request.url,
					failures: failures
				});
				throw new Error(failures);
			}

			const repoEntityId = response.referenceEntityCreateOrUpdateRepository.created[0];
			const entityId =
				request.entityId ||
				(await this.getEntityGuidFromErrorGroupGuid(accountId, request.errorGroupGuid!));
			if (entityId) {
				const entityRelationshipUserDefinedCreateOrReplaceResponse = await this.mutate<{
					errors?: { message: string }[];
				}>(
					`mutation EntityRelationshipUserDefinedCreateOrReplace($sourceEntityGuid:EntityGuid!, $targetEntityGuid:EntityGuid!) {
						entityRelationshipUserDefinedCreateOrReplace(sourceEntityGuid: $sourceEntityGuid, targetEntityGuid: $targetEntityGuid, type: BUILT_FROM) {
						  errors {
							message
							type
						  }
						}
					  }
				  `,
					{
						sourceEntityGuid: entityId,
						targetEntityGuid: repoEntityId
					}
				);
				Logger.log("NR: entityRelationshipUserDefinedCreateOrReplace", {
					sourceEntityGuid: entityId,
					targetEntityGuid: repoEntityId,
					response: entityRelationshipUserDefinedCreateOrReplaceResponse
				});

				if (entityRelationshipUserDefinedCreateOrReplaceResponse?.errors?.length) {
					const createOrReplaceError = entityRelationshipUserDefinedCreateOrReplaceResponse.errors
						.map(_ => _.message)
						.join("\n");
					Logger.warn("NR: entityRelationshipUserDefinedCreateOrReplace failure", {
						error: createOrReplaceError
					});
					throw new Error(createOrReplaceError);
				}

				return {
					directives: [
						{
							type: "assignRepository",
							data: {
								id: request.errorGroupGuid,
								entityGuid:
									response.referenceEntityCreateOrUpdateRepository &&
									response.referenceEntityCreateOrUpdateRepository.created
										? response.referenceEntityCreateOrUpdateRepository.created[0]
										: undefined,
								repo: {
									accountId: accountId,
									name: request.name,
									urls: [request.url]
								}
							}
						}
					]
				};
			} else {
				Logger.warn("NR: entityId needed for entityRelationshipUserDefinedCreateOrReplace is null");
				throw new Error("Could not locate entityId");
			}
		} catch (ex) {
			Logger.error(ex, "NR: assignRepository", {
				request: request
			});
			throw ex;
		}
	}

	@log()
	private async getUserId(): Promise<number | undefined> {
		try {
			if (this._newRelicUserId != null) {
				return this._newRelicUserId;
			}

			if (this._providerInfo && this._providerInfo.data && this._providerInfo.data.userId) {
				try {
					const id = this._providerInfo.data.userId;
					this._newRelicUserId = parseInt(id.toString(), 10);
					Logger.log("NR: getUserId (found data)", {
						userId: id
					});
				} catch (ex) {
					Logger.warn("NR: getUserId", {
						error: ex
					});
				}
			}
			if (this._newRelicUserId) return this._newRelicUserId;

			const response = await this.query(`{ actor { user { id } } }`);
			const id = response.actor?.user?.id;
			if (id) {
				this._newRelicUserId = parseInt(id, 10);
				Logger.log("NR: getUserId (found api)", {
					userId: id
				});
				return this._newRelicUserId;
			}
		} catch (ex) {
			Logger.warn("NR: getUserId " + ex.message);
		}
		return undefined;
	}

	private async getEntityGuidFromErrorGroupGuid(
		accountId: number,
		errorGroupGuid: string
	): Promise<string | undefined> {
		try {
			const results = await this.fetchMetricsData(accountId, errorGroupGuid);
			return results ? results["entity.guid"] : undefined;
		} catch (ex) {
			Logger.error(ex, "NR: getEntityIdFromErrorGroupGuid", {
				errorGroupGuid: errorGroupGuid,
				accountId: accountId
			});
			return undefined;
		}
	}

	private async fetchMetricsData(
		accountId: number,
		errorGroupGuid: string
	): Promise<
		| { [Identifier: string]: any }
		// | {
		// 		["entity.guid"]: string;
		// 		["error.group.guid"]: string;
		// 		["error.group.message"]: string;
		// 		["error.group.name"]: string;
		// 		["error.group.source"]: string;
		//   }
		// | { [Identifier: string]: string }[]
		| undefined
	> {
		let breakError;
		// NOTE: if we eventually get a timestamp, we don't need to do this
		// but recent errors only exist in MetricRaw
		for (const item of MetricsLookupBackoffs) {
			if (breakError) {
				throw breakError;
			}
			try {
				let response = await this.query(
					`query fetchErrorsInboxData($accountId:Int!) {
					actor {
					  account(id: $accountId) {
						nrql(query: "FROM ${
							item.table
						} SELECT entity.guid, error.group.guid, error.group.message, error.group.name, error.group.source WHERE error.group.guid = '${Strings.sanitizeGraphqlValue(
						errorGroupGuid
					)}' SINCE ${item.since} ago LIMIT 1") { results }
					  }
					}
				  }
				  `,
					{
						accountId: accountId
					}
				);
				const results = response.actor.account.nrql.results[0];
				if (results) {
					return results;
				}
			} catch (ex) {
				Logger.warn("NR: lookup failure", {
					accountId,
					errorGroupGuid,
					item
				});
				let accessTokenError = ex as {
					message: string;
					innerError?: { message: string };
					isAccessTokenError: boolean;
				};
				if (
					accessTokenError &&
					accessTokenError.innerError &&
					accessTokenError.isAccessTokenError
				) {
					breakError = new Error(accessTokenError.message);
				}
			}
		}
		return undefined;
	}

	@log()
	private async fetchStackTrace(
		entityGuid: string,
		occurrenceId: string
	): Promise<StackTraceResponse> {
		let fingerprintId = 0;
		try {
			// BrowserApplicationEntity uses a fingerprint instead of an occurrence and it's a number
			if (occurrenceId && occurrenceId.match(/^-?\d+$/)) {
				fingerprintId = parseInt(occurrenceId, 10);
				occurrenceId = "";
			}
		} catch {}
		return this.query(
			`query getStackTrace($entityGuid: EntityGuid!, $occurrenceId: String!, $fingerprintId: Int!) {
			actor {
			  entity(guid: $entityGuid) {
				... on ApmApplicationEntity {
				  guid
				  name
				  exception(occurrenceId: $occurrenceId) {
					message
					stackTrace {
					  frames {
						filepath
						formatted
						line
						name
					  }
					}
				  }
				}
				... on BrowserApplicationEntity {
				  guid
				  name
				  exception(fingerprint: $fingerprintId) {
					message
					stackTrace {
					  frames {
						column
						line
						formatted
						name
					  }
					}
				  }
				}
				... on MobileApplicationEntity {
				  guid
				  name
				  exception(occurrenceId: $occurrenceId) {
					stackTrace {
					  frames {
						line
						formatted
						name
					  }
					}
				  }
				  crash(occurrenceId: $occurrenceId) {
					stackTrace {
					  frames {
						line
						formatted
						name
					  }
					}
				  }
				}
			  }
			}
		  }
		  `,
			{
				entityGuid: entityGuid,
				occurrenceId: occurrenceId,
				fingerprintId: fingerprintId
			}
		);
	}

	@log()
	private async fetchErrorGroup(
		errorGroupGuid: string,
		entityGuid: string,
		occurrenceId?: string
	): Promise<ErrorGroupResponse> {
		let stackTracePromise;
		if (entityGuid && occurrenceId) {
			try {
				// kick this off
				stackTracePromise = this.fetchStackTrace(entityGuid, occurrenceId);
			} catch (ex) {
				Logger.warn("NR: fetchErrorGroup (stack trace missing)", {
					entityGuid: entityGuid,
					occurrenceId: occurrenceId
				});
				stackTracePromise = undefined;
			}
		}

		const response: ErrorGroupResponse = await this.query(
			`query getErrorGroup($errorGroupGuid:ID!, $entityGuid:EntityGuid!) {
			actor {
			  entity(guid: $entityGuid) {					 
				alertSeverity
				name
				relatedEntities(filter: {direction: BOTH, relationshipTypes: {include: BUILT_FROM}}) {
				  results {
					source {
					  entity {
						name
						guid
						type
					  }
					}
					target {
					  entity {
						name
						guid
						type
						tags {
						  key
						  values
						}
					  }
					}
					type
				  }
				}
			  }
			  errorsInbox {
				errorGroupStateTypes {
					type
				}
				errorGroup(id: $errorGroupGuid) {
				  url
				  assignment {
					email
					userInfo {
					  gravatar
					  id
					  name
					}
				  }
				  id
				  state
				}
			  }
			}
		  }			  
	  `,
			{
				errorGroupGuid: errorGroupGuid,
				entityGuid: entityGuid
			}
		);
		if (occurrenceId && response?.actor?.entity) {
			let stackTrace;
			try {
				stackTrace = await stackTracePromise;
				if (stackTrace) {
					if (response.actor.entity) {
						response.actor.entity.crash = stackTrace.actor.entity.crash;
						response.actor.entity.exception = stackTrace.actor.entity.exception;
					}
				}
			} catch (ex) {
				Logger.warn("NR: fetchErrorGroup (stack trace missing upon waiting)", {
					entityGuid: entityGuid,
					occurrenceId: occurrenceId
				});
			}
		}
		return response;
	}

	private async buildErrorDetailSettings(
		accountId: number,
		entityGuid: string,
		errorGroupGuid: string
	) {
		let meUser = undefined;
		const { users, session } = SessionContainer.instance();
		try {
			meUser = await users.getMe();
		} catch {}
		if (
			meUser &&
			meUser.user &&
			(meUser.user.email.indexOf("@newrelic.com") > -1 ||
				meUser.user.email.indexOf("@codestream.com") > -1)
		) {
			return {
				settings: {
					accountId: accountId,
					errorGroupGuid: errorGroupGuid,
					entityGuid: entityGuid,
					codeStreamUserId: meUser?.user?.id,
					codeStreamTeamId: session?.teamId,
					apiUrl: this.apiUrl
				}
			};
		}
		return undefined;
	}

	private async buildRepoRemoteVariants(remotes: string[]): Promise<string[]> {
		const set = new Set<string>();

		await Promise.all(
			remotes.map(async _ => {
				const variants = await GitRemoteParser.getRepoRemoteVariants(_);
				variants.forEach(v => {
					set.add(v.value);
				});
				return true;
			})
		);

		return Array.from(set);
	}
	/**
	 * Finds any Repositories mapped to a remote[s]
	 *
	 * @private
	 * @param {string[]} remotes
	 * @return {*}  {(Promise<
	 * 		| {
	 * 				entities?: {
	 * 					guid: string;
	 * 					name: String;
	 * 					tags: { key: string; values: string[] }[];
	 * 				}[];
	 * 				remotes?: string[];
	 * 		  }
	 * 		| undefined
	 * 	>)}
	 * @memberof NewRelicProvider
	 */
	private async findRepositoryEntitiesByRepoRemotes(
		remotes: string[]
	): Promise<
		| {
				entities?: Entity[];
				remotes?: string[];
		  }
		| undefined
	> {
		try {
			const remoteVariants: string[] = await this._memoizedBuildRepoRemoteVariants(remotes);
			if (!remoteVariants.length) return undefined;

			const remoteFilters = remoteVariants.map((_: string) => `tags.url = '${_}'`).join(" OR ");

			const queryResponse = await this.query<EntitySearchResponse>(`{
			actor {
			  entitySearch(query: "type = 'REPOSITORY' and (${remoteFilters})") {
				count
				query
				results {
				  entities {
					guid
					name
					tags {
					  key
					  values
					}
				  }
				}
			  }
			}
		  }
		  `);
			return {
				entities: queryResponse.actor.entitySearch.results.entities,
				remotes: remoteVariants
			};
		} catch (ex) {
			Logger.warn("NR: getEntitiesByRepoRemote", {
				error: ex
			});
			return undefined;
		}
	}

	private async findFingerprintedErrorTraces(accountId: number, applicationGuid: string) {
		return this.query(
			`query fetchErrorsInboxData($accountId:Int!) {
				actor {
				  account(id: $accountId) {
					nrql(query: "SELECT id, fingerprint, appName, error.class, message, entityGuid FROM ErrorTrace WHERE fingerprint IS NOT NULL and entityGuid='${applicationGuid}'  SINCE 3 days ago LIMIT 500") { nrql results }
				  }
				}
			  }
			  `,
			{
				accountId: accountId
			}
		);
	}

	private async findRelatedEntityByRepositoryGuids(
		repositoryGuids: string[]
	): Promise<{
		actor: {
			entities: {
				relatedEntities: {
					results: RelatedEntity[];
				};
			}[];
		};
	}> {
		return this.query(
			`query fetchRelatedEntities($guids:[EntityGuid]!){
			actor {
			  entities(guids: $guids) {
				relatedEntities(filter: {direction: BOTH, relationshipTypes: {include: BUILT_FROM}}) {
				  results {
					source {
					  entity {
						name
						guid
						type
					  }
					}
					target {
					  entity {
						name
						guid
						type
						tags {
							key
							values
						}
					  }
					}
					type
				  }
				}
			  }
			}
		  }
		  `,
			{
				guids: repositoryGuids
			}
		);
	}

	private async findRelatedEntityByRepositoryGuid(
		repositoryGuid: string
	): Promise<{
		actor: {
			entity: {
				relatedEntities: {
					results: RelatedEntity[];
				};
			};
		};
	}> {
		return this.query(
			`query fetchRelatedEntities($guid:EntityGuid!){
			actor {
			  entity(guid: $guid) {
				relatedEntities(filter: {direction: BOTH, relationshipTypes: {include: BUILT_FROM}}) {
				  results {
					source {
					  entity {
						name
						guid
						type
					  }
					}
					target {
					  entity {
						name
						guid
						type
						tags {
							key
							values
						}
					  }
					}
					type
				  }
				}
			  }
			}
		  }
		  `,
			{
				guid: repositoryGuid
			}
		);
	}

	private async getErrorGroupFromNameMessageEntity(
		name: string,
		message: string,
		entityGuid: string
	) {
		return this.query(
			`query getErrorGroupGuid($name: String!, $message:String!, $entityGuid:EntityGuid!){
			actor {
			  errorsInbox {
				errorGroup(errorEvent: {name: $name, 
				  message: $message, 
				  entityGuid: $entityGuid}) {
				  id
				  url											 
				}
			  }
			}
		  }									  
	  `,
			{
				name: name,
				message: message,
				entityGuid: entityGuid
			}
		);
	}

	private async getErrorsInboxAssignments(
		emailAddress: string,
		userId?: number
	): Promise<ErrorGroupsResponse | undefined> {
		try {
			if (userId == null || userId == 0) {
				// TODO fix me. remove this once we have a userId on a connection
				userId = await this.getUserId();
			}
			return this.query(
				`query getAssignments($userId: Int, $emailAddress: String!) {
				actor {
				  errorsInbox {
					errorGroups(filter: {isAssigned: true, assignment: {userId: $userId, userEmail: $emailAddress}}) {
					  results {
						url
						state
						name
						message
						id
						entityGuid
					  }
					}
				  }
				}
			  }`,
				{
					userId: userId,
					emailAddress: emailAddress
				}
			);
		} catch (ex) {
			Logger.warn("NR: getErrorsInboxAssignments", {
				userId: userId,
				usingEmailAddress: emailAddress != null
			});
			return undefined;
		}
	}

	private async getEntityGuidFromErrorGroupId(errorGroupGuid: string): Promise<string> {
		const response = await this.query(
			`query getErrorGroup($id:ID) {
actor {
  errorsInbox {
	errorGroup(id:$id) {
	  entityGuid
	}
  }
}
}`,
			{
				id: errorGroupGuid
			}
		);
		let entityGuid;
		if (response?.actor?.errorsInbox?.errorGroup) {
			entityGuid = response.actor.errorsInbox.errorGroup.entityGuid;
		}
		return entityGuid;
	}

	/**
	 * from an errorGroupGuid, returns a traceId and an entityId
	 *
	 * @private
	 * @param {string} errorGroupGuid
	 * @return {*}  {(Promise<
	 * 		| {
	 * 				entityGuid: string;
	 * 				traceId: string;
	 * 		  }
	 * 		| undefined
	 * 	>)}
	 * @memberof NewRelicProvider
	 */
	private async getMetricData(
		errorGroupGuid: string
	): Promise<
		| {
				entityGuid: string;
				traceId?: string;
		  }
		| undefined
	> {
		try {
			if (!errorGroupGuid) {
				Logger.warn("NR: getMetric missing errorGroupGuid");
				return undefined;
			}

			const accountId = this.parseId(errorGroupGuid)?.accountId!;

			const entityGuid = await this.getEntityGuidFromErrorGroupId(errorGroupGuid);
			if (!entityGuid) {
				Logger.warn("NR: getMetric missing entityGuid", {
					accountId: accountId,
					errorGroupGuid: errorGroupGuid
				});
				return undefined;
			}

			const response1 = await this.query<{
				actor: {
					account: {
						nrql: {
							results: {
								["entity.guid"]: string;
								["error.group.name"]: string;
								["error.group.message"]: string;
							}[];
						};
					};
				};
			}>(
				`query getMetric($accountId: Int!) {
					actor {
					  account(id: $accountId) {
						nrql(query: "FROM Metric SELECT entity.guid,error.group.name,error.group.message WHERE error.group.guid = '${Strings.sanitizeGraphqlValue(
							errorGroupGuid
						)}' SINCE 7 day ago LIMIT 1") {
						  results
						}
					  }
					}
				  }				  
			`,
				{
					accountId: accountId
				}
			);
			if (response1) {
				const metricResult = response1.actor.account.nrql.results[0];
				if (!metricResult) {
					Logger.warn("NR: getMetric missing metricResult", {
						accountId: accountId,
						errorGroupGuid: errorGroupGuid
					});
					return {
						entityGuid: entityGuid
					};
				}
				const response2 = await this.query<{
					actor: {
						account: {
							nrql: {
								results: {
									entityGuid: string;
									id: string;
								}[];
							};
						};
					};
				}>(
					`query getMetric($accountId: Int!) {
						actor {
						  account(id: $accountId) {
							nrql(query: "FROM ErrorTrace SELECT * WHERE error.class LIKE '${Strings.sanitizeGraphqlValue(
								metricResult["error.group.name"]
							)}' AND error.message LIKE '${Strings.sanitizeGraphqlValue(
						metricResult["error.group.message"]
					)}' AND entityGuid='${Strings.sanitizeGraphqlValue(
						metricResult["entity.guid"]
					)}' SINCE 1 week ago LIMIT 1") {
							  results
							}
						  }
						}
					  }					  
			`,
					{
						accountId: accountId
					}
				);

				if (response2) {
					const errorTraceResult = response2.actor.account.nrql.results[0];
					if (!errorTraceResult) {
						Logger.warn("NR: getMetric missing errorTraceResult", {
							accountId: accountId,
							errorGroupGuid: errorGroupGuid,
							metricResult: metricResult
						});
						return {
							entityGuid: entityGuid
						};
					}
					if (errorTraceResult) {
						return {
							entityGuid: entityGuid || metricResult["entity.guid"],
							traceId: errorTraceResult.id
						};
					}
				}
			}
		} catch (ex) {
			Logger.error(ex, "NR: getMetric", {
				errorGroupGuid: errorGroupGuid
			});
		}
		return undefined;
	}

	private async findMappedRemoteByEntity(
		entityGuid: string
	): Promise<
		| {
				url: string;
				name: string;
		  }
		| undefined
	> {
		if (!entityGuid) return undefined;

		const relatedEntityResponse = await this.findRelatedEntityByRepositoryGuid(entityGuid);
		if (relatedEntityResponse) {
			const result = this.findBuiltFrom(relatedEntityResponse.actor.entity.relatedEntities.results);
			if (result?.name && result.url) {
				return {
					name: result.name,
					url: result.url
				};
			}
		}
		return undefined;
	}

	private setAssigneeByEmail(request: { errorGroupGuid: string; emailAddress: string }) {
		return this.query(
			`mutation errorsInboxAssignErrorGroup($email: String!, $errorGroupGuid: ID!) {
			errorsInboxAssignErrorGroup(assignment: {userEmail: $email}, id: $errorGroupGuid) {
			  assignment {
				email
				userInfo {
				  email
				  gravatar
				  id
				  name
				}
			  }
			}
		  }
		  `,
			{
				email: request.emailAddress,
				errorGroupGuid: request.errorGroupGuid
			}
		);
	}

	private setAssigneeByUserId(request: { errorGroupGuid: string; userId: string }) {
		return this.query(
			`mutation errorsInboxAssignErrorGroup($userId: Int!, $errorGroupGuid: ID!) {
				errorsInboxAssignErrorGroup(assignment: {userId: $userId}, id: $errorGroupGuid) {
				  assignment {
					email
					userInfo {
					  email
					  gravatar
					  id
					  name
					}
				  }
				}
			  }`,
			{
				errorGroupGuid: request.errorGroupGuid,
				userId: parseInt(request.userId, 10)
			}
		);
	}

	private findBuiltFrom(relatedEntities: RelatedEntity[]): BuiltFromResult | undefined {
		if (!relatedEntities || !relatedEntities.length) return undefined;

		const builtFrom = relatedEntities.find(_ => _.type === "BUILT_FROM");
		if (!builtFrom) return undefined;

		const targetEntity = builtFrom.target?.entity;
		if (targetEntity) {
			const targetEntityTags = targetEntity.tags;
			if (targetEntityTags) {
				const targetEntityTagsValues = targetEntityTags.find((_: any) => _.key === "url");
				if (targetEntityTagsValues) {
					// why would there ever be more than 1??
					if (
						targetEntityTagsValues &&
						targetEntityTagsValues.values &&
						targetEntityTagsValues.values.length
					) {
						return {
							url: targetEntityTagsValues.values[0],
							name: builtFrom.target.entity.name
						};
					} else {
						Logger.warn("NR: findBuiltFrom missing tags with url[s]", {
							relatedEntities: relatedEntities
						});
						return {
							error: {
								message:
									"Could not find a repository relationship. Please check your setup and try again."
							}
						};
					}
				}
			} else {
				Logger.warn("NR: findBuiltFrom missing tags", {
					relatedEntities: relatedEntities
				});
				return {
					error: {
						message:
							"Could not find a repository relationship. Please check your setup and try again."
					}
				};
			}
		}

		return undefined;
	}

	private parseId(idLike: string): NewRelicId | undefined {
		try {
			const parsed = Buffer.from(idLike, "base64").toString("utf-8");
			if (!parsed) return undefined;

			const split = parsed.split(/\|/);
			//"140272|ERT|ERR_GROUP|12076a73-fc88-3205-92d3-b785d12e08b6"
			const [accountId, unknownAbbreviation, entityType, unknownGuid] = split;
			return {
				accountId: accountId != null ? parseInt(accountId, 10) : 0,
				unknownAbbreviation,
				entityType,
				unknownGuid
			};
		} catch (e) {
			Logger.warn("NR: " + e.message, {
				idLike
			});
		}
		return undefined;
	}

	private getRepoName(folder: { name?: string; uri: string }) {
		try {
			let folderName = (folder.name ||
				URI.parse(folder.uri)
					.fsPath.split(/[\\/]+/)
					.pop())!;
			return folderName;
		} catch (ex) {
			Logger.warn("NR: getRepoName", {
				folder: folder,
				error: ex
			});
		}
		return "repo";
	}
}
