"use strict";
import { GitRemote, GitRepository } from "git/gitService";
import { GraphQLClient } from "graphql-request";
import { Response } from "node-fetch";
import * as paths from "path";
import * as qs from "querystring";
import { URI } from "vscode-uri";
import { MarkerLocation } from "../api/extensions";
import { SessionContainer } from "../container";
import { Logger } from "../logger";
import { Markerish, MarkerLocationManager } from "../managers/markerLocationManager";
import { findBestMatchingLine, MAX_RANGE_VALUE } from "../markerLocation/calculator";
import {
	CreateThirdPartyCardRequest,
	DocumentMarker,
	FetchThirdPartyBoardsRequest,
	FetchThirdPartyBoardsResponse,
	FetchThirdPartyCardsRequest,
	FetchThirdPartyCardsResponse,
	FetchThirdPartyCardWorkflowRequest,
	FetchThirdPartyCardWorkflowResponse,
	FetchThirdPartyPullRequestRequest,
	FetchThirdPartyPullRequestResponse,
	GitHubBoard,
	GitHubCreateCardRequest,
	GitHubCreateCardResponse,
	GitHubUser,
	MoveThirdPartyCardRequest,
	MoveThirdPartyCardResponse,
	ThirdPartyProviderCard,
	GetMyPullRequestsResponse,
	MergeMethod
} from "../protocol/agent.protocol";
import { CodemarkType, CSGitHubProviderInfo, CSReferenceLocation } from "../protocol/api.protocol";
import { Arrays, Functions, log, lspProvider, Strings } from "../system";
import {
	getOpenedRepos,
	getRemotePaths,
	ProviderCreatePullRequestRequest,
	ProviderCreatePullRequestResponse,
	ProviderGetRepoInfoResponse,
	PullRequestComment,
	REFRESH_TIMEOUT,
	ThirdPartyIssueProviderBase,
	ThirdPartyProviderSupportsIssues,
	ThirdPartyProviderSupportsPullRequests
} from "./provider";

interface GitHubRepo {
	id: string;
	full_name: string;
	path: string;
	has_issues: boolean;
}

const diffHunkRegex = /^@@ -([\d]+)(?:,([\d]+))? \+([\d]+)(?:,([\d]+))? @@/;

@lspProvider("github")
export class GitHubProvider extends ThirdPartyIssueProviderBase<CSGitHubProviderInfo>
	implements ThirdPartyProviderSupportsIssues, ThirdPartyProviderSupportsPullRequests {
	async getRemotePaths(repo: any, _projectsByRemotePath: any) {
		await this.ensureConnected();
		const remotePaths = await getRemotePaths(
			repo,
			this.getIsMatchingRemotePredicate(),
			_projectsByRemotePath
		);
		return remotePaths;
	}

	private _githubUserId: string | undefined;
	private _knownRepos = new Map<string, GitHubRepo>();

	get displayName() {
		return "GitHub";
	}

	get name() {
		return "github";
	}

	get headers() {
		return {
			Authorization: `token ${this.accessToken}`,
			"user-agent": "CodeStream",
			Accept: "application/vnd.github.v3+json, application/vnd.github.inertia-preview+json"
		};
	}

	protected isPRApiCompatible(): Promise<boolean> {
		return Promise.resolve(true);
	}

	private _client: GraphQLClient | undefined;
	private get client(): GraphQLClient {
		if (this._client === undefined) {
			if (!this.accessToken) {
				throw new Error("No GitHub personal access token could be found");
			}

			this._client = new GraphQLClient(`${this.baseUrl}/graphql`, {
				headers: {
					Authorization: `Bearer ${this.accessToken}`
				}
			});
		}
		return this._client;
	}

	async onConnected() {
		this._githubUserId = await this.getMemberId();
		this._knownRepos = new Map<string, GitHubRepo>();
	}

	@log()
	async getBoards(request: FetchThirdPartyBoardsRequest): Promise<FetchThirdPartyBoardsResponse> {
		void (await this.ensureConnected());

		const openReposMap = await getOpenedRepos<GitHubRepo>(
			this.getIsMatchingRemotePredicate(),
			p => this.get<GitHubRepo>(`/repos/${p}`),
			this._knownRepos
		);

		const openRepos = Array.from(openReposMap.values());
		const boards: GitHubBoard[] = openRepos
			.filter(r => r.has_issues)
			.map(r => ({
				id: r.id,
				name: r.full_name,
				apiIdentifier: r.full_name,
				path: r.path
			}));

		if (boards.length === 0) {
			const userRepos: { [key: string]: string }[] = [];
			try {
				let url: string | undefined = "/user/repos";
				do {
					const apiResponse = await this.get<{ [key: string]: string }[]>(url);
					userRepos.push(...apiResponse.body);
					url = this.nextPage(apiResponse.response);
				} while (url);
			} catch (err) {
				Logger.error(err);
				debugger;
			}
			userRepos.sort((b1, b2) => b1.full_name.localeCompare(b2.full_name));
			boards.push(
				...userRepos
					.filter(r => r.has_issues && !boards.find(b => b.id === r.id))
					.map(repo => {
						return {
							...repo,
							id: repo.id,
							name: repo.full_name,
							apiIdentifier: repo.full_name
						};
					})
			);
		}

		return {
			boards
		};
	}

	// FIXME -- implement this
	async getCardWorkflow(
		request: FetchThirdPartyCardWorkflowRequest
	): Promise<FetchThirdPartyCardWorkflowResponse> {
		return { workflow: [] };
	}

	@log()
	async getCards(request: FetchThirdPartyCardsRequest): Promise<FetchThirdPartyCardsResponse> {
		void (await this.ensureConnected());

		try {
			const url = request.customFilter
				? `/search/issues?${qs.stringify({
						q: request.customFilter,
						sort: "updated"
				  })}`
				: "/issues";
			const result = await this.get<any>(url);
			const items = request.customFilter ? result.body.items : result.body;
			const cards: ThirdPartyProviderCard[] = items.map((card: any) => {
				return {
					id: card.id,
					url: card.html_url,
					title: card.title,
					modifiedAt: new Date(card.updated_at).getTime(),
					tokenId: card.number,
					idBoard: card.repository ? card.repository.id : "",
					comments: card.comments,
					body: card.body
				};
			});
			return { cards };
		} catch (e) {
			Logger.log("Error from GitHub: ", JSON.stringify(e, null, 4));
			return { cards: [] };
		}
	}
	@log()
	async getPullRequest(
		request: FetchThirdPartyPullRequestRequest
	): Promise<FetchThirdPartyPullRequestResponse> {
		let response = {};
		const timelineItems: any = [];
		try {
			let timelineQueryResponse;
			const pullRequestNumber = await this.getPullRequestNumber(request.pullRequestId);
			let repoOwner;
			let repoName;
			if (request.owner == null && request.repo == null) {
				const data = await this.getRepoOwnerFromPullRequestId(request.pullRequestId);
				repoOwner = data.owner;
				repoName = data.name;
			} else {
				repoOwner = request.owner;
				repoName = request.repo;
			}
			do {
				timelineQueryResponse = await this.pullRequestTimelineQuery(
					repoOwner,
					repoName,
					pullRequestNumber,
					timelineQueryResponse &&
						timelineQueryResponse.repository.pullRequest &&
						timelineQueryResponse.repository.pullRequest.timelineItems.pageInfo &&
						timelineQueryResponse.repository.pullRequest.timelineItems.pageInfo.endCursor
				);
				if (timelineQueryResponse === undefined) break;
				response = timelineQueryResponse;

				timelineItems.push(timelineQueryResponse.repository.pullRequest.timelineItems.nodes);
			} while (timelineQueryResponse.repository.pullRequest.timelineItems.pageInfo.hasNextPage);
		} catch (ex) {
			Logger.error(ex);
		}
		response = { ...response, timelineItems: timelineItems };
		return response as any;
	}

	@log()
	async createCard(request: CreateThirdPartyCardRequest) {
		void (await this.ensureConnected());

		const data = request.data as GitHubCreateCardRequest;
		const response = await this.post<{}, GitHubCreateCardResponse>(
			`/repos/${data.repoName}/issues`,
			{
				title: data.title,
				body: data.description,
				assignees: (data.assignees! || []).map(a => a.login)
			}
		);
		return { ...response.body, url: response.body.html_url };
	}

	@log()
	async moveCard(request: MoveThirdPartyCardRequest): Promise<MoveThirdPartyCardResponse> {
		return { success: false };
	}

	private async getMemberId() {
		const userResponse = await this.get<{ id: string; [key: string]: any }>(`/user`);

		return userResponse.body.id;
	}

	private nextPage(response: Response): string | undefined {
		const linkHeader = response.headers.get("Link") || "";
		if (linkHeader.trim().length === 0) return undefined;
		const links = linkHeader.split(",");
		for (const link of links) {
			const [rawUrl, rawRel] = link.split(";");
			const url = rawUrl.trim();
			const rel = rawRel.trim();
			if (rel === `rel="next"`) {
				const baseUrl = this.baseUrl;
				return url.substring(1, url.length - 1).replace(baseUrl, "");
			}
		}
		return undefined;
	}

	@log()
	async getAssignableUsers(request: { boardId: string }) {
		void (await this.ensureConnected());

		const { body } = await this.get<GitHubUser[]>(`/repos/${request.boardId}/collaborators`);
		return { users: body.map(u => ({ ...u, id: u.id, displayName: u.login })) };
	}

	@log()
	async getPullRequestDocumentMarkers({
		uri,
		repoId,
		streamId
	}: {
		uri: URI;
		repoId: string | undefined;
		streamId: string;
	}): Promise<DocumentMarker[]> {
		void (await this.ensureConnected());

		const documentMarkers: DocumentMarker[] = [];

		if (!(await this.isPRApiCompatible())) return documentMarkers;

		const { git, session } = SessionContainer.instance();

		const repo = await git.getRepositoryByFilePath(uri.fsPath);
		if (repo === undefined) return documentMarkers;

		const comments = await this._getCommentsForPath(uri.fsPath, repo);
		if (comments === undefined) return documentMarkers;

		const commentsById: { [id: string]: PullRequestComment } = Object.create(null);
		const markersByCommit = new Map<string, Markerish[]>();
		const trackingBranch = await git.getTrackingBranch(uri);

		for (const c of comments) {
			Logger.log(`GitHub.getPullRequestDocumentMarkers: processing comment ${c.id}`);

			if (
				c.pullRequest.isOpen &&
				c.pullRequest.targetBranch !== trackingBranch?.shortName &&
				c.pullRequest.sourceBranch !== trackingBranch?.shortName
			) {
				continue;
			}

			let rev;
			let line;
			if (c.line !== -1 && (await git.isValidReference(repo.path, c.commit))) {
				rev = c.commit;
				line = c.line;
			} else if (
				c.originalLine !== -1 &&
				c.originalCommit &&
				(await git.isValidReference(repo.path, c.originalCommit))
			) {
				rev = c.originalCommit!;
				line = c.originalLine;
			}

			if (rev == undefined || line === undefined || line === -1) {
				Logger.log(
					`GitHub.getPullRequestDocumentMarkers: could not get position information comment ${c.id} from PR`
				);
				Logger.log(
					`GitHub.getPullRequestDocumentMarkers: attempting to determine current revision for content-based calculation`
				);
				rev = await git.getFileCurrentRevision(uri);
				if (!rev) {
					Logger.log(
						`GitHub.getPullRequestDocumentMarkers: could not determine current revision for file ${uri.fsPath}`
					);
					continue;
				}

				Logger.log(
					`GitHub.getPullRequestDocumentMarkers: attempting to determine current revision for content-based calculation`
				);
				const contents = await git.getFileContentForRevision(uri, rev);
				if (!contents) {
					Logger.log(
						`GitHub.getPullRequestDocumentMarkers: could not read contents of ${uri.fsPath}@${rev} from git`
					);
					continue;
				}

				Logger.log(
					`GitHub.getPullRequestDocumentMarkers: calculating comment line via content analysis`
				);
				line = await findBestMatchingLine(contents, c.code, c.line);
			}

			Logger.log(
				`GitHub.getPullRequestDocumentMarkers: comment ${c.id} located at line ${line}, commit ${rev}`
			);

			let markers = markersByCommit.get(rev);
			if (markers === undefined) {
				markers = [];
				markersByCommit.set(rev, markers);
			}

			commentsById[c.id] = c;
			if (line !== -1) {
				const referenceLocation: CSReferenceLocation = {
					commitHash: rev,
					location: [line, 1, line, MAX_RANGE_VALUE, undefined],
					flags: {
						canonical: true
					}
				};
				markers.push({
					id: c.id,
					referenceLocations: [referenceLocation]
				});
			} else {
				Logger.log(
					`GitHub.getPullRequestDocumentMarkers: could not find current location for comment ${c.url}`
				);
			}
		}

		const locations = await MarkerLocationManager.computeCurrentLocations(uri, markersByCommit);

		const teamId = session.teamId;

		for (const [id, location] of Object.entries(locations.locations)) {
			const comment = commentsById[id];

			documentMarkers.push({
				id: id,
				codemarkId: undefined,
				fileUri: uri.toString(),
				fileStreamId: streamId,
				// postId: undefined!,
				// postStreamId: undefined!,
				repoId: repoId!,
				teamId: teamId,
				file: uri.fsPath,
				// commitHashWhenCreated: revision!,
				// locationWhenCreated: MarkerLocation.toArray(location),
				modifiedAt: new Date(comment.createdAt).getTime(),
				code: "",

				createdAt: new Date(comment.createdAt).getTime(),
				creatorId: comment.author.id,
				creatorName: comment.author.nickname,
				externalContent: {
					provider: {
						name: this.displayName,
						icon: "mark-github"
					},
					subhead: `#${comment.pullRequest.id}`,
					actions: [
						{
							label: "Open Comment",
							uri: comment.url
						},
						{
							label: `Open Pull Request #${comment.pullRequest.id}`,
							uri: comment.pullRequest.url
						}
					]
				},
				range: MarkerLocation.toRange(location),
				location: location,
				summary: comment.text,
				summaryMarkdown: `\n\n${Strings.escapeMarkdown(comment.text)}`,
				type: CodemarkType.Comment
			});
		}

		return documentMarkers;
	}

	@log()
	async createPullRequest(
		request: ProviderCreatePullRequestRequest
	): Promise<ProviderCreatePullRequestResponse | undefined> {
		try {
			void (await this.ensureConnected());

			if (!(await this.isPRApiCompatible())) {
				return {
					error: {
						type: "UNKNOWN",
						message: "PR Api is not compatible"
					}
				};
			}

			const repoInfo = await this.getRepoInfo({ remote: request.remote });
			if (repoInfo && repoInfo.error) {
				return {
					error: repoInfo.error
				};
			}

			const createPullRequestResponse = await this.client.request<GitHubCreatePullRequestResponse>(
				`mutation CreatePullRequest($repositoryId:String!, $baseRefName:String!, $headRefName:String!, $title:String!, $body:String!) {
					__typename
					createPullRequest(input: {repositoryId: $repositoryId, baseRefName: $baseRefName, headRefName: $headRefName, title: $title, body: $body}) {
					  pullRequest {
							number,
							url,
							title
						}
					}
				  }`,
				{
					repositoryId: repoInfo!.id,
					baseRefName: request.baseRefName,
					title: request.title,
					headRefName: request.headRefName,
					body: this.createDescription(request)
				}
			);
			const pullRequest = createPullRequestResponse.createPullRequest.pullRequest;
			const title = `#${pullRequest.number} ${pullRequest.title}`;
			return {
				url: pullRequest.url,
				title: title
			};
		} catch (ex) {
			Logger.error(ex, "GitHub: createPullRequest", {
				remote: request.remote,
				baseRefName: request.baseRefName,
				headRefName: request.headRefName
			});
			let errorMessage =
				ex.response && ex.response.errors ? ex.response.errors[0].message : "Unknown error";
			errorMessage = `GitHub: ${errorMessage}`;
			return {
				error: {
					type: "PROVIDER",
					message: errorMessage
				}
			};
		}
	}

	async getRepoInfo(request: { remote: string }): Promise<ProviderGetRepoInfoResponse> {
		try {
			const { owner, name } = this.getOwnerFromRemote(request.remote);

			const response = await this.client.request<any>(
				`query getRepoInfo($owner:String!, $name:String!) {
				repository(owner:$owner, name:$name) {
				   id
				   defaultBranchRef {
						name
				   }
				   pullRequests(first: 25, orderBy: {field: CREATED_AT, direction: DESC}, states: OPEN) {
					totalCount
					nodes {
					  id
					  url
					  title
					  state
					  createdAt
					  baseRefName
					  headRefName
					}
				  }
				}
			  }
			  `,
				{
					owner: owner,
					name: name
				}
			);
			return {
				id: response.repository.id,
				defaultBranch: response.repository.defaultBranchRef.name,
				pullRequests: response.repository.pullRequests.nodes
			};
		} catch (ex) {
			Logger.error(ex, "GitHub: getRepoInfo", {
				remote: request.remote
			});
			let errorMessage =
				ex.response && ex.response.errors ? ex.response.errors[0].message : "Unknown GitHub error";
			errorMessage = `GitHub: ${errorMessage}`;
			return {
				error: {
					type: "PROVIDER",
					message: errorMessage
				}
			};
		}
	}

	protected getOwnerFromRemote(remote: string): { owner: string; name: string } {
		// HACKitude yeah, sorry
		const uri = URI.parse(remote);
		const split = uri.path.split("/");
		const owner = split[1];
		const name = split[2].replace(".git", "");
		return {
			owner,
			name
		};
	}

	private _commentsByRepoAndPath = new Map<
		string,
		{ expiresAt: number; comments: Promise<PullRequestComment[]> }
	>();
	private _prsByRepo = new Map<string, { expiresAt: number; prs: Promise<GitHubPullRequest[]> }>();

	private _isMatchingRemotePredicate = (r: GitRemote) => r.domain === "github.com";
	getIsMatchingRemotePredicate() {
		return this._isMatchingRemotePredicate;
	}

	@log()
	private async _getCommentsForPath(
		filePath: string,
		repo: GitRepository
	): Promise<PullRequestComment[] | undefined> {
		const cc = Logger.getCorrelationContext();

		try {
			const relativePath = Strings.normalizePath(paths.relative(repo.path, filePath));
			const cacheKey = `${repo.path}|${relativePath}`;

			const cachedComments = this._commentsByRepoAndPath.get(cacheKey);
			if (cachedComments !== undefined && cachedComments.expiresAt > new Date().getTime()) {
				// NOTE: Keep this await here, so any errors are caught here
				return await cachedComments.comments;
			}

			const remotePath = await getRemotePaths(
				repo,
				this.getIsMatchingRemotePredicate(),
				this._knownRepos
			);

			const commentsPromise: Promise<PullRequestComment[]> =
				remotePath != null
					? this._getCommentsForPathCore(filePath, relativePath, remotePath, repo.path)
					: Promise.resolve([]);
			this._commentsByRepoAndPath.set(cacheKey, {
				expiresAt: new Date().setMinutes(new Date().getMinutes() + REFRESH_TIMEOUT),
				comments: commentsPromise
			});

			// Since we aren't cached, we want to just kick of the request to get the comments (which will fire a notification)
			// This could probably be enhanced to wait for the commentsPromise for a short period of time (maybe 1s?) to see if it will complete, to avoid the notification roundtrip for fast requests
			return undefined;
		} catch (ex) {
			Logger.error(ex, cc);
			return undefined;
		}
	}

	private async _getCommentsForPathCore(
		filePath: string,
		relativePath: string,
		remotePaths: string[],
		repoPath: string
	): Promise<PullRequestComment[]> {
		let prs: GitHubPullRequest[];

		const cachedPRs = this._prsByRepo.get(repoPath);

		if (cachedPRs !== undefined && cachedPRs.expiresAt > new Date().getTime()) {
			prs = await cachedPRs.prs;
		} else {
			const prsPromise = this._getPullRequests(remotePaths);
			this._prsByRepo.set(repoPath, {
				expiresAt: new Date().setMinutes(new Date().getMinutes() + REFRESH_TIMEOUT),
				prs: prsPromise
			});

			prs = await prsPromise;
		}

		const comments: PullRequestComment[] = [];

		for (const pr of prs) {
			if (pr.reviewThreads.totalCount === 0) continue;

			let comment: PullRequestComment;
			let prComment;
			for (const rt of pr.reviewThreads.nodes) {
				if (rt.comments.totalCount === 0) continue;

				prComment = rt.comments.nodes[0];
				if (prComment.path !== relativePath) continue;

				comment = {
					id: rt.id,
					author: {
						id: prComment.author.login,
						nickname: prComment.author.login
					},
					path: prComment.path,
					text: prComment.bodyText,
					code: "",
					commit: prComment.outdated ? prComment.originalCommit.oid : prComment.commit.oid,
					originalCommit: prComment.originalCommit.oid,
					line: prComment.position || prComment.originalPosition,
					originalLine: prComment.originalPosition,
					url: prComment.url,
					createdAt: new Date(prComment.createdAt).getTime(),
					pullRequest: {
						id: pr.number,
						url: pr.url,
						isOpen: pr.state === "OPEN",
						targetBranch: pr.baseRefName,
						sourceBranch: pr.headRefName
					},
					diffHunk: prComment.diffHunk,
					outdated: prComment.outdated
				};

				const diffLines = comment.diffHunk!.split("\n");
				// Get rid of the hunk header
				diffLines.shift();

				// Since we can't trust the positions from GitHub, we "calc" them by counting the number of original/new lines in the diff hunk
				// Because the diff hunk that GitHub returns always ends at the commented on line
				const originalPosition =
					Arrays.count(diffLines, l => l.startsWith("-") || l.startsWith(" ")) - 1;
				const position = Arrays.count(diffLines, l => l.startsWith("+") || l.startsWith(" ")) - 1;

				// Get the code from the diff hunk
				comment.code = diffLines[diffLines.length - 1] || "";
				if (comment.code) {
					// Strip off the diff hunk +/-
					comment.code = comment.code.substr(1);
				}

				// Since the provided line numbers are offsets in the diff hunk, add the diff hunk line to the offset line
				const match = diffHunkRegex.exec(comment.diffHunk!);
				if (match == null) continue;

				const [, originalLine, , line] = match;

				comment.originalLine! = Number(originalLine) + originalPosition;
				comment.line = Number(line) + position;

				comments.push(comment);
			}
		}

		// If we have any comments, fire a notification
		if (comments.length !== 0) {
			SessionContainer.instance().documentMarkers.fireDidChangeDocumentMarkers(
				URI.file(filePath).toString(),
				"codemarks"
			);
		}

		return comments;
	}

	private async _getPullRequests(remotePaths: string[]) {
		const prs = [];

		for (const remotePath of remotePaths) {
			try {
				const [owner, repo] = remotePath.split("/");
				let response;
				do {
					response = await this.prQuery(owner, repo, response && response.pageInfo.endCursor);
					if (response === undefined) break;

					prs.push(...response.nodes);
				} while (response.pageInfo.hasNextPage);
			} catch (ex) {
				Logger.error(ex);
			}
		}

		return prs;
	}

	private _prQueryRateLimit:
		| {
				limit: number;
				cost: number;
				remaining: number;
				resetAt: Date;
		  }
		| undefined;

	private _prTimelineQueryRateLimit:
		| {
				limit: number;
				cost: number;
				remaining: number;
				resetAt: Date;
		  }
		| undefined;

	// async getLabels(owner: string, repo: string) {
	// 	const query = await this.client.request<any>(
	// 		`query FindReviewers($owner:String!,$name:String!) {
	// 			repository($owner:String!,$name:String!) {
	// 			  id
	// 			  labels(first: 50) {
	// 				nodes {
	// 				  color
	// 				  name
	// 				  id
	// 				  description
	// 				}
	// 			  }
	// 			}
	// 		  }`,
	// 		{
	// 			owner: owner,
	// 			name: repo
	// 		}
	// 	);
	// 	return query.repository.labels.nodes;
	// }

	async getLabels(request: { owner: string; repo: string }) {
		const query = await this.client.request<any>(
			`query getLabels($owner:String!, $name:String!) {
				repository(owner:$owner, name:$name) {
				  id
				  labels(first: 50) {
					nodes {
					  color
					  name
					  id
					  description
					}
				  }
				}
			  }`,
			{
				owner: request.owner,
				name: request.repo
			}
		);
		return query.repository.labels.nodes;
	}

	async getReviewers(request: { owner: string; repo: string }) {
		const query = await this.client.request<any>(
			`query FindReviewers($owner:String!, $name:String!)  {
				repository(owner:$owner, name:$name) {
				  id
				  collaborators(first: 50) {
					nodes {
					  avatarUrl
					  id
					  name
					}
				  }
				}
			  }`,
			{
				owner: request.owner,
				name: request.repo
			}
		);

		return query.repository.collaborators.nodes;
	}

	async addLabelToPullRequest(request: {
		owner: string;
		repo: string;
		pullRequestId: string;
		labelId: string;
	}) {
		const pullRequestInfo = await this.client.request<any>(
			`query FindPullRequest($owner:String!,$name:String!,$pullRequestId:Int!) {
					repository(owner:$owner name:$name) {
					  pullRequest(number: $pullRequestId) {
						id
					  }
					}
				  }`,
			{
				owner: request.owner,
				name: request.repo,
				pullRequestId: parseInt(request.pullRequestId, 10)
			}
		);

		const prId = pullRequestInfo.repository.pullRequest.id;
		const query = `mutation AddLabelsToLabelable($labelableId: String!,$labelIds:String!) {
			addLabelsToLabelable(input: {labelableId: $labelableId, labelIds:$labelIds}) {
				  clientMutationId
				}
			  }`;

		const rsp = await this.client.request<any>(query, {
			labelableId: prId,
			labelIds: request.labelId
		});
		return true;
	}

	// async closePullRequest(request: { pullRequestId: string }) {
	// 	const query = `mutation ClosePullRequest($pullRequestId: String!) {
	// 		closePullRequest(input: {pullRequestId: $pullRequestId}) {
	// 			  clientMutationId
	// 			}
	// 		  }`;

	// 	const rsp = await this.client.request<any>(query, {
	// 		pullRequestId: request.pullRequestId
	// 	});
	// 	return true;
	// }

	async getMyPullRequests(request: {
		owner: string;
		repo: string;
	}): Promise<GetMyPullRequestsResponse[]> {
		let results: any = [];
		const repoQuery =
			request && request.owner && request.repo ? `repo:${request.owner}/${request.repo} ` : "";
		const searchByAuthorResult = await this.client.request<any>(
			`query GetMyPullRequests {
				search(query: "${repoQuery}is:pr is:open author:@me", type: ISSUE, last: 100) {
				edges {
				  node {
					... on PullRequest {
						url
						title
						createdAt
						author {
						  login
						  avatarUrl(size: 20)
						  url
						}
						bodyText
						number
						state
						updatedAt
						lastEditedAt
						id
					}
				  }
				}
			  }
			}`
		);
		if (searchByAuthorResult && searchByAuthorResult.search && searchByAuthorResult.search.edges) {
			results = results.concat(searchByAuthorResult.search.edges.map((_: any) => _.node));
		}
		const searchByAssigneeResult = await this.client.request<any>(
			`query GetPullRequestsAssignedToMe {
				search(query: "${repoQuery}is:pr is:open assignee:@me", type: ISSUE, last: 100) {
					edges {
					  node {
						... on PullRequest {
							url
							title
							createdAt
							author {
							  login
							  avatarUrl(size: 20)
							  url
							}
							bodyText
							number
							state
							updatedAt
							lastEditedAt
							id
						}
					  }
					}
				  }
				}`
		);
		if (
			searchByAssigneeResult &&
			searchByAssigneeResult.search &&
			searchByAssigneeResult.search.edges
		) {
			results = results.concat(searchByAssigneeResult.search.edges.map((_: any) => _.node));
		}
		return results
			.map((pr: { createdAt: string }) => ({ ...pr, createdAt: new Date(pr.createdAt).getTime() }))
			.sort((a: { createdAt: number }, b: { createdAt: number }) => b.createdAt - a.createdAt);
	}

	async getPullRequestIdFromUrl(request: { url: string }) {
		// since we only the url for the PR -- parse it out for the
		// data we need.
		const uri = URI.parse(request.url);
		const path = uri.path.split("/");
		const owner = path[1];
		const repo = path[2];
		const pullRequestNumber = parseInt(path[4], 10);
		const pullRequestInfo = await this.client.request<any>(
			`query FindPullRequest($owner:String!,$name:String!,$pullRequestNumber:Int!) {
					repository(owner:$owner name:$name) {
					  pullRequest(number: $pullRequestNumber) {
						id
					  }
					}
				  }`,
			{
				owner: owner,
				name: repo,
				pullRequestNumber: pullRequestNumber
			}
		);
		return pullRequestInfo.repository.pullRequest.id;
	}

	async updatePullRequest(request: {
		owner: string;
		repo: string;
		pullRequestId: string;
		pullRequest: {
			title: string;
		};
	}) {
		const pullRequestInfo = await this.client.request<any>(
			`query FindPullRequest($owner:String!,$name:String!,$pullRequestId:Int!) {
					repository(owner:$owner name:$name) {
					  pullRequest(number: $pullRequestId) {
						id
					  }
					}
				  }`,
			{
				owner: request.owner,
				name: request.repo,
				pullRequestId: parseInt(request.pullRequestId, 10)
			}
		);

		const prId = pullRequestInfo.repository.pullRequest.id;
		const query = `mutation UpdatePullRequest($pullRequestId: String!, $title: String) {
			updatePullRequest(input: {pullRequestId: $pullRequestId, title: $title}) {
				  clientMutationId
				}
			  }`;

		const rsp = await this.client.request<any>(query, {
			pullRequestId: prId,
			title: request.pullRequest.title
		});
		return true;
	}

	async mergePullRequest(request: { pullRequestId: string; mergeMethod: MergeMethod }) {
		// let owner;
		// let name;
		// if (request.owner == null && request.repo == null) {
		// 	const data = await this.getRepoIdFromPullRequestId(request.pullRequestId);
		// 	owner = data.owner;
		// 	name = data.name;
		// } else {
		// 	owner = request.owner;
		// 	name = request.repo;
		// }
		// const pullRequestNumber = await this.getPullRequestNumber(request.pullRequestId);
		// const pullRequestInfo = await this.client.request<any>(
		// 	`query FindPullRequest($owner:String!,$name:String!,$pullRequestNumber:Int!) {
		// 			repository(owner:$owner name:$name) {
		// 			  pullRequest(number: $pullRequestNumber) {
		// 				id
		// 			  }
		// 			}
		// 		  }`,
		// 	{
		// 		owner: owner,
		// 		name: name,
		// 		pullRequestNumber: pullRequestNumber
		// 	}
		// );
		if (!request.mergeMethod) throw new Error("InvalidMergeMethod");
		const mergeMethods = new Set(["MERGE", "REBASE", "SQUASH"]);
		if (!mergeMethods.has(request.mergeMethod)) throw new Error("InvalidMergeMethod");

		// const prId = pullRequestInfo.repository.pullRequest.id;
		const query = `mutation MergePullRequest($pullRequestId: String!) {
			mergePullRequest(input: {pullRequestId: $pullRequestId, mergeMethod: ${request.mergeMethod}}) {
				  clientMutationId
				}
			  }`;

		const rsp = await this.client.request<any>(query, {
			pullRequestId: request.pullRequestId
		});
		return true;
	}

	async lockPullRequest(request: { pullRequestId: string; lockReason: string }) {
		// OFF_TOPIC, TOO_HEATED, SPAM
		await this.client.request<any>(
			`mutation LockPullRequest($pullRequestId: String!, $lockReason:String!) {
				lockLockable(input: {lockableId: $pullRequestId, lockReason:$lockReason}) {
				  clientMutationId
				}
			  }`,
			{
				pullRequestId: request.pullRequestId,
				lockReason: request.lockReason
			}
		);

		return true;
	}

	async unlockPullRequest(request: { pullRequestId: string }) {
		await this.client.request<any>(
			`mutation UnlockPullRequest($pullRequestId: String!) {
				unlockLockable(input: {lockableId: $pullRequestId}) {
				  clientMutationId
				}
			  }`,
			{
				pullRequestId: request.pullRequestId
			}
		);

		return true;
	}

	async createPullRequestCommentAndClose(request: { pullRequestId: string; text: string }) {
		await this.client.request<any>(
			`mutation AddCommentToPullRequest($pullRequestId: String!, $body:String!) {
				addComment(input: {subjectId: $pullRequestId, body:$body}) {
				  clientMutationId
				}
			  }`,
			{
				pullRequestId: request.pullRequestId,
				body: request.text
			}
		);

		await this.client.request<any>(
			`mutation ClosePullRequest($pullRequestId: String!) {
			closePullRequest(input: {pullRequestId: $pullRequestId}) {
				  clientMutationId
				}
			}`,
			{
				pullRequestId: request.pullRequestId
			}
		);

		return true;
	}

	async createPullRequestComment(request: { pullRequestId: string; text: string }) {
		const query = `mutation AddCommentToPullRequest($subjectId: String!, $body: String!) {
				addComment(input: {subjectId: $subjectId, body:$body}) {
				  clientMutationId
				}
			  }`;

		const rsp = await this.client.request<any>(query, {
			subjectId: request.pullRequestId,
			body: request.text
		});
		return true;
	}

	async getRepoOwnerFromPullRequestId(id: string) {
		const query = `query GetRepoIdFromPullRequestId($id: [ID!]!) {
			rateLimit {
				limit
				cost
				remaining
				resetAt
			}
			nodes(ids: $id) {
			  ... on PullRequest {
				repository {
				  name
				  owner {
					login
				  }
				}
			  }
			}
		  }`;
		const rsp = await this.client.request<any>(query, {
			id: id
		});
		return {
			name: rsp.nodes[0].repository.name,
			owner: rsp.nodes[0].repository.owner.login
		};
	}

	async getPullRequestNumber(id: string) {
		const query = `query getNode($id: ID!) {
			rateLimit {
				limit
				cost
				remaining
				resetAt
			}
			node(id: $id) {
			 ... on PullRequest {
				number
			  }
			}
		  }`;
		const rsp = await this.client.request<any>(query, {
			id: id
		});
		return rsp.node.number;
	}

	async pullRequestTimelineQuery(
		owner: string,
		repo: string,
		pullRequestNumber: number,
		cursor?: string
	): Promise<FetchThirdPartyPullRequestResponse | undefined> {
		const cc = Logger.getCorrelationContext();

		// If we are or will be over the rate limit, wait until it gets reset
		if (
			this._prTimelineQueryRateLimit !== undefined &&
			this._prTimelineQueryRateLimit.remaining - this._prTimelineQueryRateLimit.cost < 0
		) {
			// TODO: Probably should send a notification to the webview here

			// If we are currently paging, just give up and return what we have
			if (cursor === undefined) return undefined;

			await Functions.wait(this._prTimelineQueryRateLimit.resetAt.getTime() - new Date().getTime());
		}

		// TODO: Need to page if there are more than 100 review threads
		try {
			const query = `query pr($owner: String!, $name: String!, $pullRequestNumber: Int!) {
				rateLimit {
				  limit
				  cost
				  remaining
				  resetAt
				}
				repository(name: $name, owner: $owner) {
				  id
				  pullRequest(number: $pullRequestNumber) {
					id
					body
					baseRefName
					author {
					  login
					  avatarUrl
					}
					createdAt
					files(first: 100) {
						totalCount
						nodes {
						  path
						  deletions
						  additions
						}
					  }
					commits(first: 100) {
						totalCount
						nodes {
						  commit {
							abbreviatedOid
							author {
							  avatarUrl(size: 20)
							  name
							  user {
								login
							  }
							}
							message
							authoredDate
						  }
						}
					  }
					headRefName
					labels(first: 10) {
					  nodes {
						color
						description
						name
					  }
					}
					number
					state
					... on PullRequest {
					  reviewRequests(first: 10) {
						nodes {
						  requestedReviewer {
							... on User {
							  login
							  avatarUrl
							}
						  }
						}
					  }
					  reviews(first: 50) {
						nodes {
						  author {
							login
							avatarUrl
						  }
						  state
						}
					  }
					}
					timelineItems(first: 50) {
					  totalCount
					  pageInfo {
						startCursor
						endCursor
						hasNextPage
					  }
					  __typename
					  nodes {
						... on UserBlockedEvent {
						  __typename
						}
						... on AddedToProjectEvent {
						  __typename
						}
						... on AssignedEvent {
						  __typename
						  actor {
							login
							avatarUrl
						  }
						  createdAt
						  assignee {
							... on User {
							  id
							  email
							  login
							}
						  }
						}
						... on AutomaticBaseChangeFailedEvent {
						  __typename
						}
						... on AutomaticBaseChangeSucceededEvent {
						  __typename
						}
						... on BaseRefChangedEvent {
						  __typename
						}
						... on BaseRefForcePushedEvent {
						  __typename
						}
						... on ClosedEvent {
						  __typename
						}
						... on IssueComment {
						  __typename
						  author {
							login
							avatarUrl
						  }
						  bodyText
						  createdAt
						}
						... on HeadRefRestoredEvent {
						  __typename
						}
						... on HeadRefForcePushedEvent {
						  __typename
						  actor {
							login
							avatarUrl
						  }
						}
						... on HeadRefDeletedEvent {
						  __typename
						  actor {
							login
							avatarUrl
						  }
						}
						... on DisconnectedEvent {
						  __typename
						  id
						}
						... on DeploymentEnvironmentChangedEvent {
						  __typename
						  id
						}
						... on DeployedEvent {
						  __typename
						  id
						}
						... on DemilestonedEvent {
						  __typename
						  id
						}
						... on CrossReferencedEvent {
						  __typename
						  id
						  actor {
							login
							avatarUrl
						  }
						}
						... on ConvertedNoteToIssueEvent {
						  __typename
						  id
						}
						... on ConvertToDraftEvent {
						  __typename
						  actor {
							login
							avatarUrl
						  }
						}
						... on ConnectedEvent {
						  __typename
						}
						... on CommentDeletedEvent {
						  __typename
						  actor {
							login
							avatarUrl
						  }
						}
						... on LabeledEvent {
						  __typename
						  label {
							name
							description
							color
						  }
						  actor {
							login
							avatarUrl
						  }
						  createdAt
						}
						... on LockedEvent {
						  __typename
						}
						... on MarkedAsDuplicateEvent {
						  __typename
						}
						... on UnsubscribedEvent {
						  __typename
						}
						... on UnpinnedEvent {
						  __typename
						}
						... on UnmarkedAsDuplicateEvent {
						  __typename
						}
						... on UnlockedEvent {
						  __typename
						}
						... on UnlabeledEvent {
						  __typename
						  label {
							color
							name
							description
						  }
						}
						... on UnassignedEvent {
						  __typename
						}
						... on TransferredEvent {
						  __typename
						}
						... on SubscribedEvent {
						  __typename
						}
						... on ReviewRequestedEvent {
						  __typename
						  actor {
							login
							avatarUrl
						  }
						}
						... on ReviewRequestRemovedEvent {
						  __typename
						}
						... on ReviewDismissedEvent {
						  __typename
						}
						... on ReopenedEvent {
						  __typename
						}
						... on RenamedTitleEvent {
						  __typename
						  actor {
							login
							avatarUrl
						  }
						  currentTitle
						  previousTitle
						  createdAt
						}
						... on RemovedFromProjectEvent {
						  __typename
						}
						... on ReferencedEvent {
						  __typename
						  actor {
							login
							avatarUrl
						  }
						  commit {
							messageBody
							messageHeadline
							status {
							  state
							}
							oid
						  }
						}
						... on ReadyForReviewEvent {
						  __typename
						}
						... on PullRequestRevisionMarker {
						  __typename
						  createdAt
						  pullRequest {
							state
						  }
						  lastSeenCommit {
							abbreviatedOid
							status {
							  state
							}
						  }
						}
						... on PullRequestReviewThread {
						  __typename
						}
						... on PullRequestReview {
						  __typename
						  author {
							login
							avatarUrl
						  }
						  bodyText
						  createdAt
						  lastEditedAt
						  body
						  comments(first: 15) {
							nodes {
							  author {
								login
								avatarUrl
							  }
							  bodyText
							  diffHunk
							  body
							  lastEditedAt
							  createdAt
							  id
							  state
							  authorAssociation
							  draftedAt
							  minimizedReason
							  publishedAt
							  replyTo {
								diffHunk
								id
								bodyText
								body
							  }
							  commit {
								message
								messageBody
								messageHeadline
								oid
							  }
							  editor {
								login
								avatarUrl
							  }
							  outdated
							  path
							  position
							  pullRequest {
								bodyText
							  }
							  pullRequestReview {
								body
								bodyText
							  }
							}
						  }
						  authorAssociation
						  bodyHTML
						}
						... on PullRequestCommitCommentThread {
						  __typename
						}
						... on PullRequestCommit {
						  __typename
						  commit {
							changedFiles
							author {
							  avatarUrl
							}
							id
							message
							messageBody
							messageHeadline
							messageHeadlineHTML
							messageBodyHTML
							abbreviatedOid
						  }
						}
						... on PinnedEvent {
						  __typename
						}
						... on MovedColumnsInProjectEvent {
						  __typename
						}
						... on MilestonedEvent {
						  __typename
						  actor {
							login
							avatarUrl
							resourcePath
							url
						  }
						}
						... on MergedEvent {
						  __typename
						  actor {
							login
							avatarUrl
						  }
						  mergeRefName
						  createdAt
						  commit {
							abbreviatedOid
						  }
						}
						... on MentionedEvent {
						  __typename
						  actor {
							login
							avatarUrl
						  }
						  createdAt
						}
					  }
					}
					milestone {
					  title
					  state
					  number
					  id
					  description
					}
					participants(first: 10) {
					  nodes {
						login
						avatarUrl(size: 20)
					  }
					}
					assignees(first: 10) {
					  nodes {
						bio
						avatarUrl(size: 20)
						id
						name
						login
					  }
					}
					projectCards(first: 10) {
					  nodes {
						id
						note
						state
						project {
						  name
						}
					  }
					}
					mergeable
					merged
					mergedAt
					title
					url
					updatedAt
				  }
				  rebaseMergeAllowed
				  squashMergeAllowed
				  mergeCommitAllowed
				}
			  }`;
			const rsp = await this.client.request<any>(query, {
				owner: owner,
				name: repo,
				pullRequestNumber: pullRequestNumber,
				cursor: cursor
			});

			this._prTimelineQueryRateLimit = {
				cost: rsp.rateLimit.cost,
				limit: rsp.rateLimit.limit,
				remaining: rsp.rateLimit.remaining,
				resetAt: new Date(rsp.rateLimit.resetAt)
			};

			return rsp;
		} catch (ex) {
			Logger.error(ex, cc);

			// If we are currently paging, just give up and return what we have
			if (cursor !== undefined) return undefined;

			throw ex;
		}
	}

	async prQuery(
		owner: string,
		repo: string,
		cursor?: string
	): Promise<GitHubPullRequests | undefined> {
		const cc = Logger.getCorrelationContext();

		// If we are or will be over the rate limit, wait until it gets reset
		if (
			this._prQueryRateLimit !== undefined &&
			this._prQueryRateLimit.remaining - this._prQueryRateLimit.cost < 0
		) {
			// TODO: Probably should send a notification to the webview here

			// If we are currently paging, just give up and return what we have
			if (cursor === undefined) return undefined;

			await Functions.wait(this._prQueryRateLimit.resetAt.getTime() - new Date().getTime());
		}

		// TODO: Need to page if there are more than 100 review threads
		try {
			const query = `query pr($owner: String!, $repo: String!) {
				repository(name: $repo, owner: $owner${cursor ? `after: $cursor` : ""}) {
					pullRequests(states: [OPEN, MERGED], first: 100, orderBy: { field: UPDATED_AT, direction: DESC }) {
						totalCount
						pageInfo {
							startCursor
							endCursor
							hasNextPage
						}
						nodes {
							title
							number
							url
							state
							baseRefName
							headRefName
							reviewThreads(first: 100) {
								totalCount
								pageInfo {
									startCursor
									endCursor
									hasNextPage
								}
								nodes {
									id
									isResolved
									comments(first: 1) {
										totalCount
										nodes {
											author {
												login
											}
											bodyText
											createdAt
											url
											path
											commit {
												oid
											}
											originalCommit {
												oid
											}
											originalPosition
											diffHunk
											position
											outdated
											state
										}
									}
								}
							}
						}
					}
				},
				rateLimit {
					limit
					cost
					remaining
					resetAt
				}
			}`;

			const rsp = await this.client.request<GetPullRequestsResponse>(query, {
				owner: owner,
				repo: repo,
				cursor: cursor
			});

			this._prQueryRateLimit = {
				cost: rsp.rateLimit.cost,
				limit: rsp.rateLimit.limit,
				remaining: rsp.rateLimit.remaining,
				resetAt: new Date(rsp.rateLimit.resetAt)
			};

			return rsp.repository.pullRequests;
		} catch (ex) {
			Logger.error(ex, cc);

			// If we are currently paging, just give up and return what we have
			if (cursor !== undefined) return undefined;

			throw ex;
		}
	}
}

interface GitHubPullRequest {
	title: string;
	number: number;
	url: string;
	state: string;
	baseRefName: string;
	headRefName: string;
	reviewThreads: {
		totalCount: number;
		pageInfo: {
			startCursor: string;
			endCursor: string;
			hasNextPage: boolean;
		};
		nodes: {
			id: string;
			isResolved: boolean;
			comments: {
				totalCount: number;
				nodes: {
					author: {
						login: string;
					};
					bodyText: string;
					createdAt: string;
					url: string;
					path: string;
					commit: {
						oid: string;
					};
					originalCommit: {
						oid: string;
					};
					originalPosition: number;
					diffHunk: string;
					position: number | null;
					outdated: boolean;
				}[];
			};
		}[];
	};
}

interface GitHubPullRequests {
	totalCount: number;
	pageInfo: {
		startCursor: string;
		endCursor: string;
		hasNextPage: boolean;
	};
	nodes: GitHubPullRequest[];
}

interface GetPullRequestsResponse {
	repository: {
		pullRequests: GitHubPullRequests;
	};
	rateLimit: {
		limit: number;
		cost: number;
		remaining: number;
		resetAt: string;
	};
}

interface GitHubCreatePullRequestResponse {
	createPullRequest: {
		pullRequest: {
			number: number;
			title: string;
			url: string;
		};
	};
}
