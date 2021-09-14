"use strict";
import { MessageType } from "../api/apiProvider";
import {
	NewRelicErrorGroup,
	GetNewRelicDataRequest,
	GetNewRelicDataRequestType,
	GetNewRelicDataResponse,
	GetNewRelicErrorGroupRequest,
	GetNewRelicErrorGroupRequestType,
	GetNewRelicErrorGroupResponse,
	NewRelicConfigurationData,
	ThirdPartyProviderConfig,
	GetNewRelicAssigneesRequestType
} from "../protocol/agent.protocol";
import { CSMe, CSNewRelicProviderInfo } from "../protocol/api.protocol";
import { log, lspProvider } from "../system";
import { ThirdPartyIssueProviderBase } from "./provider";
import { GraphQLClient } from "graphql-request";
import { InternalError, ReportSuppressedMessages } from "../agentError";
import { Logger } from "../logger";
import { lspHandler } from "../system";
import { CodeStreamSession } from "../session";
import { SessionContainer } from "../container";
import { Strings } from "../system/string";

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
			// TODO fix me need a switch or something for this
			return Logger.isDebugging ? "https://staging-api.newrelic.com" : "https://api.newrelic.com";
		}
	}

	get productUrl() {
		return Logger.isDebugging ? "https://staging-one.newrelic.com" : "https://one.newrelic.com";
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

	async mutate<T>(query: string, variables: any = undefined) {
		return (await this.client()).request<T>(query, variables);
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

	private parseId(idLike: string): NewRelicId | undefined {
		try {
			const parsed = Buffer.from(idLike, "base64").toString("utf-8");
			if (!parsed) return undefined;

			const split = parsed.split(/\|/);
			//"140272|ERT|ERR_GROUP|12026a73-fc72-3205-92d3-b785d12e08b6"
			const [accountId, unknownAbbreviation, entityType, unknownGuid] = split;
			return {
				accountId: accountId != null ? parseInt(accountId, 10) : 0,
				unknownAbbreviation,
				entityType,
				unknownGuid
			};
		} catch (e) {
			Logger.warn(e.message, {
				idLike
			});
		}
		return undefined;
	}

	@lspHandler(GetNewRelicErrorGroupRequestType)
	@log()
	async getNewRelicErrorsInboxData(
		request: GetNewRelicErrorGroupRequest
	): Promise<GetNewRelicErrorGroupResponse | undefined> {
		// TODO fix me need real values
		let repoRemote = "git@github.com:teamcodestream/codestream-server-demo";
		let sha = "9542e9c702f0879f8407928eb313b33174a7c2b5";
		let errorGroup: NewRelicErrorGroup | undefined = undefined;
		let accountId = 0;
		try {
			await this.ensureConnected();

			const errorGroupGuid = request.errorGroupGuid;
			const parsedId = this.parseId(errorGroupGuid)!;
			accountId = parsedId.accountId;

			let response;
			response = await this.query(
				`query fetchErrorsInboxData($accountId:Int!) {
					actor {
					  account(id: $accountId) {
						nrql(query: "FROM Metric SELECT entity.guid, error.group.guid, error.group.message, error.group.name, error.group.source, error.group.nrql WHERE error.group.guid = '${Strings.santizeGraphqlValue(
							errorGroupGuid
						)}' SINCE 24 hours ago LIMIT 1") { nrql results }
					  }
					}
				  }
				  `,
				{
					accountId: accountId
				}
			);
			const results = response.actor.account.nrql.results[0];
			let entityId;
			if (results) {
				entityId = results["entity.guid"];
				errorGroup = {
					accountId: accountId,
					entityGuid: entityId,
					guid: results["error.group.guid"],
					title: results["error.group.name"],
					message: results["error.group.message"],
					nrql: results["error.group.nrql"],
					source: results["error.group.source"],
					timestamp: results["timestamp"],
					errorGroupUrl: `${this.productUrl}/redirect/errors-inbox/${errorGroupGuid}`,
					entityUrl: `${this.productUrl}/redirect/entity/${results["entity.guid"]}`,
					// TODO fix me
					state: "UNRESOLVED",
					states: ["RESOLVED", "IGNORED", "UNRESOLVED"]
				};
				response = await this.query(
					`{
						actor {
						  entity(guid: "${errorGroup?.entityGuid}") {
							alertSeverity
							name
						  }
						}
					  }
				  `
				);
				errorGroup.entityName = response.actor.entity.name;
				errorGroup.entityAlertingSeverity = response.actor.entity.alertSeverity;
				errorGroup.attributes = {
					Timestamp: { type: "timestamp", value: errorGroup.timestamp },
					// TODO fix me
					"Host display name": { type: "string", value: "10.16.33.9:15595" },
					"URL host": { type: "string", value: "shardcache.vip.cf.nr-ops.net" },
					"URL path": { type: "string", value: "/api/urlRules/1869706/375473842" }
				};

				if (!request.traceId) {
					// HACK to find a traceId if none supplied -- find the latest traceId

					const queryAsString = `
					query fetchErrorsInboxData($accountId:Int!) {
						actor {
						  account(id: $accountId) {
							nrql(query: "FROM ErrorTrace SELECT * WHERE entityGuid = '${entityId}' and message = '${results[
						"error.group.message"
					].replace(/'/g, "\\'")}' LIMIT 1") { 
						results 
					}
						  }
						}
					  }
					  `;
					const tracesResponse = await this.query(queryAsString, {
						accountId: accountId
					});
					if (tracesResponse?.actor?.account?.nrql?.results?.length) {
						request.traceId = tracesResponse?.actor.account.nrql.results[0].traceId;
					}
				}

				// TODO fix me below does not work yet
				const foo = false;
				if (foo) {
					const assigneeResults = await this.query(
						`query getStatus($entityId:String, $errorGroupGuid:String) {
						actor {
						  entity(guid: $entityId) {
							... on WorkloadEntity {
							  guid
							  name
							  errorGroup(id: $errorGroupGuid) {
								assignedUser {
								  email
								  gravatar
								  id
								  name
								}
								state
								id
							  }
							}
						  }
						}
					  }
					  `,
						{
							entityId: entityId,
							errorGroupGuid: errorGroupGuid
						}
					);
					if (assigneeResults) {
						errorGroup.state = assigneeResults.actor.entity.errorGroup.state;
						const assignee = assigneeResults.actor.entity.errorGroup.assignedUser;
						if (assignee) {
							errorGroup.assignee = assignee;
						}
					}

					const stackTraceResult = await this.query(
						`query getTrace($entityId: EntityGuid!, $traceId: String!) {
					actor {
					  entity(guid: $entityId) {
						... on ApmApplicationEntity {
						  guid
						  name
						  errorTrace(traceId: $traceId) {
							id
							exceptionClass
							intrinsicAttributes
							message
							path
							stackTrace {
							  filepath
							  line
							  name
							  formatted
							}
						  }
						}
					  }
					}
				  }
				  `,
						{
							entityId: entityId,
							traceId: request.traceId
						}
					);

					errorGroup.errorTrace = {
						id: stackTraceResult.actor.entity.errorTrace.id,
						path: stackTraceResult.actor.entity.errorTrace.path,
						stackTrace: stackTraceResult.actor.entity.errorTrace.stackTrace
					};
				}
				// TODO fix me
				errorGroup.errorTrace = {
					id: "10d5c489-049f-11ec-86ae-0242ac110009_14970_28033",
					path: "WebTransaction/SpringController/api/urlRules/{accountId}/{applicationId} (GET)",
					stackTrace: [
						{
							formatted:
								"\torg.springframework.web.servlet.FrameworkServlet.processRequest(FrameworkServlet.java:1013)"
						},
						{
							formatted:
								"\torg.springframework.web.servlet.FrameworkServlet.doGet(FrameworkServlet.java:897)"
						},
						{
							formatted: "\tjavax.servlet.http.HttpServlet.service(HttpServlet.java:634)"
						},
						{
							formatted:
								"\torg.springframework.web.servlet.FrameworkServlet.service(FrameworkServlet.java:882)"
						},
						{
							formatted: "\tjavax.servlet.http.HttpServlet.service(HttpServlet.java:741)"
						},
						{
							formatted:
								"\torg.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:231)"
						},
						{
							formatted:
								"\torg.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:166)"
						},
						{
							formatted: "\torg.apache.tomcat.websocket.server.WsFilter.doFilter(WsFilter.java:53)"
						},
						{
							formatted:
								"\torg.apache.catalina.core.ApplicationFilterChain.internalDoFilter(ApplicationFilterChain.java:193)"
						},
						{
							formatted:
								"\torg.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:166)"
						},
						{
							formatted:
								"\torg.springframework.boot.actuate.web.trace.servlet.HttpTraceFilter.doFilterInternal(HttpTraceFilter.java:88)"
						},
						{
							formatted:
								"\torg.springframework.web.filter.OncePerRequestFilter.doFilter(OncePerRequestFilter.java:109)"
						}
					]
				};
				Logger.debug("NR:ErrorGroup", {
					errorGroup: errorGroup
				});

				errorGroup.repo = repoRemote ? { url: repoRemote } : undefined;

				// TODO fix me
				errorGroup.hasStackTrace = true;
			} else {
				Logger.log("No results", {
					request: request
				});
			}

			return {
				sha,
				accountId,
				errorGroup
			};
		} catch (ex) {
			Logger.error(ex);
			return {
				sha: sha,
				accountId,
				errorGroup: undefined as any
			};
		}
	}

	@lspHandler(GetNewRelicAssigneesRequestType)
	@log()
	async getAssignableUsers(request: { boardId: string }) {
		await this.ensureConnected();

		const { scm } = SessionContainer.instance();
		const committers = await scm.getLatestCommittersAllRepos();
		let users: any[] = [];
		if (committers?.scm) {
			users = users.concat(
				Object.keys(committers.scm).map((_: string) => {
					return {
						id: _,
						displayName: _,
						email: _,
						group: "GIT"
					};
				})
			);
		}

		// TODO fix me get users from NR

		// users.push({
		// 	id: "a",
		// 	displayName: "A",
		// 	email: "a@a.com",
		// 	avatarUrl: "A",
		// 	group: "NR"
		// });

		return {
			users: users
		};
	}

	@log()
	async setAssignee(request: {
		errorGroupGuid: string;
		userId: string;
	}): Promise<Directives | undefined> {
		try {
			await this.ensureConnected();
			// TODO fix me
			const response = await this._setAssignee(request);

			// TODO fix me
			return {
				directives: [
					{
						type: "setAssignee",
						data: {
							assignee: {
								email: "cheese@cheese.com",
								id: 1,
								name: "cheese"
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
		userId: string;
	}): Promise<Directives | undefined> {
		try {
			await this.ensureConnected();
			// TODO fix me
			const response = await this._setAssignee({ ...request, userId: "0" });

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
			await this.ensureConnected();

			// TODO fix me

			// const response = await this.mutate<{
			// 	errorTrackingUpdateErrorGroupState: {
			// 		error?: any;
			// 		state?: string;
			// 	};
			// }>(
			// 	`mutation setState($errorGroupGuid:ID!, $state:ErrorTrackingErrorGroupState) {
			// 		errorTrackingUpdateErrorGroupState(id:
			// 		  $errorGroupGuid, state: {state: $state}) {
			// 		  state
			// 		  errors {
			// 			description
			// 			type
			// 		  }
			// 		}
			// 	  }`,
			// 	{
			// 		errorGroupGuid: request.errorGroupGuid,
			// 		state: request.state
			// 	}
			// );
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
			Logger.error(ex);
			return undefined;
		}
	}

	@log()
	async assignRepository(request: {
		accountId?: string;
		errorGroupGuid: string;
		name?: string;
		url: string;
	}): Promise<Directives | undefined> {
		try {
			await this.ensureConnected();

			const accountId = request.accountId || this._providerInfo?.data?.accountId;
			const name = request.name;
			// const response = await this.mutate(
			// 	`mutation assignRepository($accountId: Int!, $name: String!, $url: String!) {
			// 		referenceEntityCreateOrUpdateRepository(repositories: [{accountId: $accountId, name: $name, url: $url}]) {
			// 		  created
			// 		  failures {
			// 			guid
			// 			message
			// 			type
			// 		  }
			// 		}
			// 	  }
			//   `,
			// 	{
			// 		accountId: accountId,
			// 		name: name,
			// 		url: request.url
			// 	}
			// );
			return {
				directives: [
					{
						type: "assignRepository",
						data: {
							id: request.errorGroupGuid,
							repo: {
								accountId: accountId,
								name: request.name,
								url: request.url
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

	private _setAssignee(request: { errorGroupGuid: string; userId: string }) {
		return this.query(
			`mutation removeUser($errorGroupGuid: String!, userId: Int!) {
					errorTrackingAssignErrorGroup(id: $errorGroupGuid, assignment: {userId: $userId}) {
					  errors {
						description
						type
					  }
					  assignedUser {
						email
						gravatar
						id
						name
					  }
					}
				  }`,
			{
				errorGroupGuid: request.errorGroupGuid,
				userId: parseInt(request.userId, 10)
			}
		);
	}
}
