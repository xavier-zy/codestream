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
	SetNewRelicErrorGroupAssigneeRequest,
	SetNewRelicErrorGroupAssigneeResponse,
	SetNewRelicErrorGroupStateRequest,
	SetNewRelicErrorGroupStateResponse,
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
import { lsp } from "system/decorators/lsp";

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
			// TODO need a switch or something for this
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

	@lspHandler(GetNewRelicErrorGroupRequestType)
	@log()
	async getNewRelicErrorsInboxData(
		request: GetNewRelicErrorGroupRequest
	): Promise<GetNewRelicErrorGroupResponse | undefined> {
		// TODO need real values
		let repo = "git@github.com:teamcodestream/codestream-server-demo";
		let sha = "9542e9c702f0879f8407928eb313b33174a7c2b5";
		//let parsedStack: string[] = [];
		let errorGroup: NewRelicErrorGroup | undefined = undefined;

		try {
			await this.ensureConnected();

			// try {
			//	({ repo, sha } = JSON.parse(route.query.customAttributes));
			// 	parsedStack = route.query.stack ? JSON.parse(route.query.stack) : [];
			// } catch (ex) {
			// 	Logger.warn("missing repo or sha", { repo, sha });
			// }

			const accountId = this._providerInfo?.data?.accountId;
			if (!accountId) {
				throw new Error("must provide an accountId");
			}

			let response;
			const errorGroupId = request.errorGroupId;

			response = await this.query(
				`query fetchErrorsInboxData($accountId:Int!) {
					actor {
					  account(id: $accountId) {
						nrql(query: "FROM Metric SELECT entity.guid, error.group.guid, error.group.message, error.group.name, error.group.source, error.group.nrql WHERE error.group.guid = '${errorGroupId}' SINCE 24 hours ago LIMIT 1") { nrql results }
					  }
					}
				  }
				  `,
				{
					accountId: parseInt(accountId, 10)
				}
			);
			const results = response.actor.account.nrql.results[0];
			let entityId;
			if (results) {
				entityId = results["entity.guid"];
				errorGroup = {
					entityGuid: entityId,
					guid: results["error.group.guid"],
					message: results["error.group.message"],
					title: results["error.group.name"],
					nrql: results["error.group.nrql"],
					source: results["error.group.source"],
					timestamp: results["timestamp"],
					errorsInboxUrl: `${this.productUrl}/redirect/errors-inbox/${errorGroupId}`,
					entityUrl: `${this.productUrl}/redirect/entity/${results["entity.guid"]}`
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

				// if (request.traceId) {
				// 	const tracesResponse = await this.query(
				// 		`query fetchErrorsInboxData($accountId:Int!) {
				// 			actor {
				// 			  account(id: $accountId) {
				// 				nrql(query: "FROM ErrorTrace SELECT * WHERE entityGuid = '${entityId}' and message=${results[
				// 			"error.group.message"
				// 		].replace(/'/g, "\\'")} LIMIT 1") { results }
				// 			  }
				// 			}
				// 		  }
				// 		  `,
				// 		{
				// 			accountId: parseInt(accountId, 10)
				// 		}
				// 	);
				// 	if (tracesResponse?.actor.account.results) {
				// 	}
				// 	// /FROM ErrorTrace SELECT * WHERE entityGuid = 'MzQwMjYyfEFQTXxBUFBMSUNBVElPTnw0MjIxMDk4' LIMIT  1
				// }
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
				// TODO below does not work yet
				const foo = false;
				if (foo) {
					const assigneeResults = await this.query(`{
						actor {
						  entity(guid: "${entityId}") {
							... on WorkloadEntity {
							  guid
							  name
							  errorGroup(id: "${errorGroupId}") {
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
					  `);
					if (assigneeResults) {
						errorGroup.state = assigneeResults.actor.entity.errorGroup.state;
						const assignee = assigneeResults.actor.entity.errorGroup.assignedUser;
						if (assignee) {
							errorGroup.assignee = assignee;
						}
					}

					const stackTraceResult = await this.query(`{
					actor {
					  entity(guid: "<entityId>") {
						... on ApmApplicationEntity {
						  guid
						  name
						  errorTrace(traceId: "<traceId>") {
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
				  `);
				}
				Logger.debug("NR:ErrorGroup", {
					errorGroup: errorGroup
				});
				errorGroup.repo = repo;
				// TODO fix me
				errorGroup.hasStackTrace = true;
			} else {
				Logger.log("No results", {
					request: request
				});
			}

			return {
				repo,
				sha,
				errorGroup
			};
		} catch (ex) {
			Logger.error(ex);
			return {
				repo: repo,
				sha: sha,
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
	async setNewRelicErrorsInboxAssignee(
		request: SetNewRelicErrorGroupAssigneeRequest
	): Promise<SetNewRelicErrorGroupAssigneeResponse | undefined> {
		try {
			await this.ensureConnected();
			const response = await this.query(
				`mutation {
					errorTrackingAssignErrorGroup(id: "${request.errorGroupId}", assignment: {userId: ${request.userId}}) {
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
				  }`
			);
			return true;
		} catch (ex) {
			Logger.error(ex);
			return undefined;
		}
	}

	@log()
	async setNewRelicErrorsInboxState(
		request: SetNewRelicErrorGroupStateRequest
	): Promise<SetNewRelicErrorGroupStateResponse | undefined> {
		try {
			await this.ensureConnected();
			const response = await this.mutate<{
				errorTrackingUpdateErrorGroupState: {
					error?: any;
					state?: string;
				};
			}>(
				`mutation setState($errorGroupId:ID!, $state:ErrorTrackingErrorGroupState) {
					errorTrackingUpdateErrorGroupState(id: 
					  $errorGroupId, state: {state: $state}) {
					  state
					  errors {
						description
						type
					  }
					}
				  }`,
				{
					errorGroupId: request.errorGroupId,
					state: request.state
				}
			);
			return true;
		} catch (ex) {
			Logger.error(ex);
			return undefined;
		}
	}
}
