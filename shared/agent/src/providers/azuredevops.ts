"use strict";
import * as qs from "querystring";
import { Logger } from "../logger";
import {
	AzureDevOpsCard,
	AzureDevOpsConfigurationData,
	AzureDevOpsCreateCardRequest,
	AzureDevOpsCreateCardResponse,
	AzureDevOpsProject,
	AzureDevOpsTeam,
	AzureDevOpsUser,
	CreateThirdPartyCardRequest,
	FetchThirdPartyBoardsRequest,
	FetchThirdPartyBoardsResponse,
	FetchThirdPartyCardsRequest,
	FetchThirdPartyCardsResponse,
	MoveThirdPartyCardRequest,
	ThirdPartyProviderBoard,
	ThirdPartyProviderCard,
	ThirdPartyProviderUser
} from "../protocol/agent.protocol";
import { CSAzureDevOpsProviderInfo } from "../protocol/api.protocol";
import { log, lspProvider } from "../system";
import { ThirdPartyIssueProviderBase } from "./provider";

interface AzureDevOpsProfile {
	emailAddress: string;
	displayName: string;
	[key: string]: any;
}

@lspProvider("azuredevops")
export class AzureDevOpsProvider extends ThirdPartyIssueProviderBase<CSAzureDevOpsProviderInfo> {
	private _user: AzureDevOpsProfile | undefined;

	get displayName() {
		return "Azure DevOps";
	}

	get name() {
		return "azuredevops";
	}

	get apiPath() {
		const organization = (this._providerInfo && this._providerInfo.organization) || "";
		return `/${organization}`;
	}

	get headers() {
		return {
			Authorization: `Bearer ${this.accessToken}`
		};
	}

	async onConnected() {}

	@log()
	async getBoards(request: FetchThirdPartyBoardsRequest): Promise<FetchThirdPartyBoardsResponse> {
		await this.ensureConnected();

		let boards: ThirdPartyProviderBoard[] = [];
		try {
			const response = await this.get<{ value: AzureDevOpsProject[] }>(
				`/_apis/projects?${qs.stringify({
					"api-version": "5.0"
				})}`
			);
			boards = response.body.value.map(project => {
				return {
					id: project.id,
					name: project.name,
					singleAssignee: true
				};
			});
		} catch (err) {
			Logger.error(err);
			debugger;
		}
		return { boards };
	}

	@log()
	async getCards(request: FetchThirdPartyCardsRequest): Promise<FetchThirdPartyCardsResponse> {
		await this.ensureConnected();

		let cards: ThirdPartyProviderCard[] = [];
		try {
			const wiql =
				"Select ID, Title, Description, State, [Team Project] " +
				"From WorkItems " +
				"Where State <> 'Closed' " +
				"And [Assigned To] = @Me ";
			// "Order By [State] Asc, [Changed Date] Desc";

			// "Where [Work Item Type] = 'Bug' " +
			// "And [System.State] <> 'Closed' " +
			const { body } = (await this.post(
				`/_apis/wit/wiql?${qs.stringify({
					query: wiql,
					"api-version": "5.0"
				})}`,
				{ query: wiql },
				{ "Content-Type": "application/json" }
			)) as any;
			Logger.debug("GOT A RESPONSE OF : ", JSON.stringify(body, null, 4));
			if (body && body.workItems) {
				// @ts-ignore
				cards = body.workItems.map(workItem => {
					Logger.debug("AZURE ITEM: ", JSON.stringify(workItem, null, 4));
					return {
						id: workItem.ID,
						url: workItem.html_url,
						// @ts-ignore
						// title: workItem.fields["System.Title"],
						modifiedAt: new Date(workItem.updated_at).getTime(),
						tokenId: workItem.number,
						body: workItem.body
					};
				});
			}
		} catch (err) {
			Logger.error(err);
			debugger;
		}
		return { cards: [] };
	}

	@log()
	async createCard(request: CreateThirdPartyCardRequest) {
		await this.ensureConnected();

		const data = request.data as AzureDevOpsCreateCardRequest;
		const cardData: { [key: string]: any }[] = [
			{
				op: "add",
				path: "/fields/System.title",
				from: null,
				value: data.title
			},
			{
				op: "add",
				path: "/fields/System.description",
				from: null,
				value: data.description
			}
		];

		if (data.assignee) {
			cardData.push({
				op: "add",
				path: "/fields/System.AssignedTo",
				from: null,
				value: data.assignee.id
			});
		}

		const response = await this.post<{}, AzureDevOpsCreateCardResponse>(
			`/${request.data.boardId}/_apis/wit/workitems/$Issue?${qs.stringify({
				"api-version": "5.0"
			})}`,
			cardData,
			{ "Content-Type": "application/json-patch+json" }
		);

		const card = response.body;
		card.url = response.body._links && response.body._links.html && response.body._links.html.href;
		return card;
	}

	@log()
	async moveCard(request: MoveThirdPartyCardRequest) {}

	@log()
	async getAssignableUsers(request: { boardId: string }) {
		await this.ensureConnected();

		let users: ThirdPartyProviderUser[] = [];

		try {
			const response = await this.get<{ value: AzureDevOpsTeam[] }>(
				`/_apis/projects/${request.boardId}/teams?${qs.stringify({
					"api-version": "5.0"
				})}`
			);

			await Promise.all(
				response.body.value.map(async team => {
					const userResponse = await this.get<{ value: AzureDevOpsUser[] }>(
						`/_apis/projects/${request.boardId}/teams/${team.id}/members?${qs.stringify({
							"api-version": "5.0"
						})}`
					);

					const uniqueUsers = userResponse.body.value.filter(user => {
						return !users.find(u => u.id === user.identity.uniqueName);
					});

					users = [
						...users,
						...uniqueUsers.map(user => {
							return {
								id: user.identity.uniqueName,
								displayName: user.identity.displayName
							};
						})
					];
				})
			);
		} catch (ex) {
			Logger.error(ex);
			debugger;
		}
		return { users };
	}

	@log()
	async configure(request: AzureDevOpsConfigurationData) {
		await this.session.api.setThirdPartyProviderInfo({
			providerId: this.providerConfig.id,
			host: request.host,
			data: {
				organization: request.organization
			}
		});
	}

	private async getMe(): Promise<AzureDevOpsProfile> {
		const userResponse = await this.get<AzureDevOpsProfile>(
			"https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=5.0",
			{},
			{ absoluteUrl: true }
		);
		return userResponse.body;
	}
}
