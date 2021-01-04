"use strict";
import * as qs from "querystring";
import { GraphQLClient } from "graphql-request";
import { Logger } from "../logger";
import {
	LinearConfigurationData,
	LinearCreateCardRequest,
	LinearCreateCardResponse,
	LinearIssue,
	LinearProject,
	LinearTeam,
	LinearUser,
	CreateThirdPartyCardRequest,
	FetchThirdPartyBoardsRequest,
	FetchThirdPartyBoardsResponse,
	FetchThirdPartyCardsRequest,
	FetchThirdPartyCardsResponse,
	MoveThirdPartyCardRequest,
	ThirdPartyDisconnect,
	ThirdPartyProviderCard
} from "../protocol/agent.protocol";
import { CSLinearProviderInfo } from "../protocol/api.protocol";
import { log, lspProvider } from "../system";
import { ThirdPartyIssueProviderBase } from "./provider";

@lspProvider("linear")
export class LinearProvider extends ThirdPartyIssueProviderBase<CSLinearProviderInfo> {
	private _linearUserInfo: LinearUser | undefined;
	private _linearTeam: LinearTeam | undefined;

	get displayName() {
		return "Linear";
	}

	get name() {
		return "linear";
	}

	get headers() {
		return {
			"Content-Type": "application/json",
			"Linear-Token": this.accessToken!
		};
	}

	async onConnected() {
		this._linearUserInfo = await this.getMemberInfo();
	}

	@log()
	async onDisconnected(request?: ThirdPartyDisconnect) {
		// delete the graphql client so it will be reconstructed if a new token is applied
		delete this._client;
		super.onDisconnected(request);
	}

	get graphQlBaseUrl() {
		return `${this.baseUrl}/graphql`;
	}

	protected _client: GraphQLClient | undefined;
	protected async client(): Promise<GraphQLClient> {
		if (this._client === undefined) {
			this._client = new GraphQLClient(this.graphQlBaseUrl);
		}
		if (!this.accessToken) {
			throw new Error("Could not get a Linear access token");
		}

		this._client.setHeaders({
			Authorization: `Bearer ${this.accessToken}`
		});

		return this._client;
	}

	async query<T = any>(query: string, variables: any = undefined) {
		return (await this.client()).request<any>(query, variables);
	}

	async mutate<T>(query: string, variables: any = undefined) {
		return (await this.client()).request<T>(query, variables);
	}

	@log()
	async getCards(request: FetchThirdPartyCardsRequest): Promise<FetchThirdPartyCardsResponse> {
		await this.ensureConnected();

		const response = await this.query<{ user: { assignedIssues: { nodes: LinearIssue[] } } }>(
			`query { user(id: "${
				this._linearUserInfo!.id
			}") { assignedIssues { nodes { id title updatedAt url description } } } }`
		);

		const cards: ThirdPartyProviderCard[] = response.user.assignedIssues.nodes.map(
			(issue: LinearIssue) => {
				return {
					id: issue.id,
					url: issue.url,
					title: issue.title,
					modifiedAt: new Date(issue.updatedAt).getTime(),
					tokenId: issue.id,
					body: issue.description
				};
			}
		);
		cards.sort((a, b) => {
			return a.modifiedAt - b.modifiedAt;
		});

		return { cards };
	}

	@log()
	async getTeam(): Promise<LinearTeam> {
		if (this._linearTeam) return this._linearTeam;
		const response = await this.query<{ teams: { nodes: LinearTeam[] } }>(
			"query { teams { nodes { id name } } }"
		);
		if (response.teams.nodes.length === 0) throw new Error("linear user has no teams");
		this._linearTeam = response.teams.nodes[0];
		return this._linearTeam!;
	}

	@log()
	async getBoards(request: FetchThirdPartyBoardsRequest): Promise<FetchThirdPartyBoardsResponse> {
		await this.ensureConnected();

		const team = await this.getTeam();
		const response = await this.query<{ data: { issues: { nodes: LinearProject[] } } }>(
			`query { 
				team(id: "${team.id}") {
					projects {
						nodes {
							id
							name
						}
					}
				}
			}`
		);
		const projects = [{ id: "_", name: "No Project" }, ...response.team.projects.nodes];
		return { boards: projects };
	}

	@log()
	async createCard(request: CreateThirdPartyCardRequest) {
		await this.ensureConnected();

		const team = await this.getTeam();
		const data = request.data as LinearCreateCardRequest;
		const assigneeId = (data.assignees && data.assignees[0] && data.assignees[0].id) || "";
		const project = data.projectId !== "_" ? `projectId: "${data.projectId}"` : "";
		const assignee = assigneeId ? `assigneeId: "${assigneeId}"` : "";
		const query = `
			mutation {
				issueCreate(
					input: {
						title: "${data.name.trim()}"
						description: "${data.description.trim()}"
						teamId: "${team.id}"
						${project}
						${assignee}
					}
				) {
					success
					issue {
						id
						title
						url
					}
				}
			}
		`;
		const response = await this.query<{ issueCreate: { issue: LinearIssue } }>(query);
		return response.issueCreate.issue;
	}

	@log()
	async moveCard(request: MoveThirdPartyCardRequest) {
		return { success: false };
	}

	@log()
	async getAssignableUsers(request: { boardId: string }) {
		await this.ensureConnected();

		const response = await this.query<{ users: { nodes: LinearUser[] } }>(
			"query { users { nodes { id name email } } }"
		);
		return { users: response.users.nodes.map((u: LinearUser) => ({ ...u, displayName: u.name })) };
	}

	private async getMemberInfo(): Promise<LinearUser> {
		const response = await this.query<{ viewer: LinearUser }>("query { viewer { id name email } }");
		return response.viewer;
	}
}
