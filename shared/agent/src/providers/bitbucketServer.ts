"use strict";
import { GitRemote, GitRepository } from "git/gitService";
import * as paths from "path";
import * as qs from "querystring";
import { URI } from "vscode-uri";
import { SessionContainer } from "../container";
import { Logger } from "../logger";
import { Markerish, MarkerLocationManager } from "../managers/markerLocationManager";
import { MAX_RANGE_VALUE } from "../markerLocation/calculator";
import { DocumentMarker, EnterpriseConfigurationData } from "../protocol/agent.protocol";
import {
	CodemarkType,
	CSBitbucketProviderInfo,
	CSLocationArray,
	CSReferenceLocation
} from "../protocol/api.protocol";
import { Arrays, log, lspProvider, Strings } from "../system";
import {
	ApiResponse,
	getOpenedRepos,
	getRemotePaths,
	ProviderCreatePullRequestRequest,
	ProviderCreatePullRequestResponse,
	ProviderPullRequestInfo,
	PullRequestComment,
	REFRESH_TIMEOUT,
	ThirdPartyIssueProviderBase,
	ThirdPartyProviderSupportsIssues,
	ThirdPartyProviderSupportsPullRequests
} from "./provider";

interface BitbucketRepo {
	uuid: string;
	full_name: string;
	path: string;
	owner: {
		uuid: string;
		username: string;
		type: string;
	};
	has_issues: boolean;
}

interface BitbucketServerRepo {
	id: string;
	name: string;
	path: string;
}

/*
interface BitbucketPermission {
	permission: string;
	repository: BitbucketRepo;
}
*/

interface BitbucketUser {
	uuid: string;
	display_name: string;
	account_id: string;
}

interface BitbucketValues<T> {
	values: T;
	isLastPage?: boolean;
	nextPageStart?: number;
}

interface BitbucketPullRequest {
	id: number;
	title: string;
	state: string;
	destination: {
		branch: {
			name: string;
		};
	};
	source: {
		branch: {
			name: string;
		};
	};
	links: {
		html: { href: string };
		comments: {
			href: string;
		};
	};
}

interface BitbucketPullRequestComment {
	id: string;
	user: {
		account_id: string;
		nickname: string;
	};
	content: {
		raw: string;
	};
	created_on: string;
	links: { html: { href: string }; code: { href: string } };
	inline: {
		to?: number;
		from?: number;
		outdated?: boolean;
		path: string;
	};
	pullrequest: {
		id: number;
		title: string;
		links: {
			html: {
				href: string;
			};
		};
	};
}

interface GetPullRequestsResponse extends BitbucketValues<BitbucketPullRequest[]> {}

interface GetPullRequestCommentsResponse extends BitbucketValues<BitbucketPullRequestComment[]> {}

/**
 * BitBucket provider
 * @see https://developer.atlassian.com/bitbucket/api/2/reference/
 */
@lspProvider("bitbucket_server")
export class BitbucketServerProvider extends ThirdPartyIssueProviderBase<CSBitbucketProviderInfo> {
	/*implements ThirdPartyProviderSupportsIssues, ThirdPartyProviderSupportsPullRequests*/
	// private _bitbucketUserId: string | undefined;
	private _knownRepos = new Map<string, BitbucketServerRepo>();
	private _repos: BitbucketServerRepo[] = [];

	get displayName() {
		return "Bitbucket Server";
	}

	get name() {
		return "bitbucket_server";
	}

	get apiPath() {
		return "/rest/api/1.0";
	}

	get baseUrl() {
		return `${this._providerInfo?.data?.baseUrl}${this.apiPath}`;
	}

	get headers() {
		return {
			Authorization: `Bearer ${this.accessToken}`,
			"Content-Type": "application/json"
		};
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

	async onConnected() {
		// this._bitbucketUserId = await this.getMemberId();
		this._knownRepos = new Map<string, BitbucketServerRepo>();
	}

	getRepoByPath(path: string) {
		const parts = path.split("/");
		if (parts.length > 1) {
			return this.get<BitbucketServerRepo>(`/projects/${parts[0]}/repos/${parts[1]}`);
		} else {
			throw new Error("improper bitbucket path");
		}
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

		const { git, session } = SessionContainer.instance();

		const repo = await git.getRepositoryByFilePath(uri.fsPath);
		if (repo === undefined) return documentMarkers;

		const comments = await this._getCommentsForPath(uri.fsPath, repo);
		if (comments === undefined) return documentMarkers;

		const commentsById: { [id: string]: PullRequestComment } = Object.create(null);
		const markersByCommit = new Map<string, Markerish[]>();
		const trackingBranch = await git.getTrackingBranch(uri);

		for (const c of comments) {
			if (
				c.pullRequest.isOpen &&
				c.pullRequest.targetBranch !== trackingBranch?.shortName &&
				c.pullRequest.sourceBranch !== trackingBranch?.shortName
			) {
				continue;
			}

			let markers = markersByCommit.get(c.commit);
			if (markers === undefined) {
				markers = [];
				markersByCommit.set(c.commit, markers);
			}

			commentsById[c.id] = c;
			const referenceLocations: CSReferenceLocation[] = [];
			if (c.line >= 0) {
				referenceLocations.push({
					commitHash: c.commit,
					location: [c.line, 1, c.line, MAX_RANGE_VALUE, undefined] as CSLocationArray,
					flags: {
						canonical: true
					}
				});
			}
			markers.push({
				id: c.id,
				referenceLocations
			});
		}

		const locations = await MarkerLocationManager.computeCurrentLocations(uri, markersByCommit);

		const teamId = session.teamId;

		for (const [id, location] of Object.entries(locations.locations)) {
			const comment = commentsById[id];

			documentMarkers.push({
				id: id,
				fileUri: uri.toString(),
				codemarkId: undefined,
				fileStreamId: streamId,
				// postId: undefined!,
				// postStreamId: undefined!,
				repoId: repoId!,
				teamId: teamId,
				file: uri.fsPath,
				// commitHashWhenCreated: revision!,
				// locationWhenCreated: MarkerLocation.toArray(location),
				modifiedAt: new Date(comment.createdAt).getTime(),
				code: comment.code,

				createdAt: new Date(comment.createdAt).getTime(),
				creatorId: comment.author.id,
				creatorName: comment.author.nickname,
				externalContent: {
					provider: {
						name: this.displayName,
						icon: this.name
					},
					subhead: `#${comment.pullRequest.id}`,
					actions: [
						{
							label: "Open Comment",
							uri: comment.url
						},
						{
							label: `Open Merge Request #${comment.pullRequest.id}`,
							uri: comment.pullRequest.url
						}
					]
				},
				range: {
					start: {
						line: location.lineStart - 1,
						character: 0
					},
					end: {
						line: location.lineEnd - 1,
						character: 0
					}
				},
				location: location,
				summary: comment.text,
				summaryMarkdown: `\n\n${Strings.escapeMarkdown(comment.text)}`,
				type: CodemarkType.Comment
			});
		}

		return documentMarkers;
	}

	async getRemotePaths(repo: any, _projectsByRemotePath: any) {
		await this.ensureConnected();
		const remotePaths = await getRemotePaths(
			repo,
			this.getIsMatchingRemotePredicate(),
			_projectsByRemotePath
		);
		return remotePaths;
	}

	protected getOwnerFromRemote(remote: string): { owner: string; name: string } {
		// HACKitude yeah, sorry
		const uri = URI.parse(remote);
		const split = uri.path.split("/");
		if (split[1] === "scm") {
			const owner = split[2];
			const name = split[3].replace(".git", "");
			return {
				owner,
				name
			};
		}
		const owner = split[1];
		const name = split[2].replace(".git", "");
		return {
			owner,
			name
		};
	}

	async createPullRequest(
		request: ProviderCreatePullRequestRequest
	): Promise<ProviderCreatePullRequestResponse | undefined> {
		void (await this.ensureConnected());

		try {
			const repoInfo = await this.getRepoInfo({ remote: request.remote });
			if (repoInfo && repoInfo.error) {
				return {
					error: repoInfo.error
				};
			}
			const { owner, name } = this.getOwnerFromRemote(request.remote);
			const createPullRequestResponse = await this.post<
				BitbucketServerCreatePullRequestRequest,
				BitbucketServerCreatePullRequestResponse
			>(`/projects/${owner}/repos/${name}/pull-requests`, {
				fromRef: {
					id: request.headRefName,
					repository: {
						project: {
							key: repoInfo.project.key
						},
						slug: name
					}
				},
				toRef: {
					id: request.baseRefName,
					repository: {
						project: {
							key: repoInfo.project.key
						},
						slug: name
					}
				},
				title: request.title,
				description: this.createDescription(request)
			});

			const title = `#${createPullRequestResponse.body.id} ${createPullRequestResponse.body.title}`;
			return {
				url:
					createPullRequestResponse.body.links.self &&
					createPullRequestResponse.body.links.self.length
						? createPullRequestResponse.body.links.self[0].href
						: undefined,
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

	async getRepoInfo(request: { remote: string }): Promise<any> {
		try {
			const { owner, name } = this.getOwnerFromRemote(request.remote);
			const repoResponse = await this.get<BitbucketServerRepo>(`/projects/${owner}/repos/${name}`);
			const defaultBranchResponse = await this.get<BitbucketServerBranch>(
				`/projects/${owner}/repos/${name}/branches/default`
			);

			const defaultBranchName = defaultBranchResponse
				? defaultBranchResponse.body.displayId
				: undefined;

			const pullRequestResponse = await this.get<any>(
				`/projects/${owner}/repos/${name}/pull-requests?state=OPEN`
			);
			let pullRequests: ProviderPullRequestInfo[] = [];
			if (pullRequestResponse && pullRequestResponse.body && pullRequestResponse.body.values) {
				pullRequests = pullRequestResponse.body.values.map((_: any) => {
					return {
						id: _.id,
						url: _.links!.self[0]!.href,
						baseRefName: _.toRef.displayId,
						headRefName: _.fromRef.displayId
					};
				});
			}
			return {
				id: repoResponse.body.id,
				project: {
					key: repoResponse.body.project.key
				},
				defaultBranch: defaultBranchName,
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

	private _commentsByRepoAndPath = new Map<
		string,
		{ expiresAt: number; comments: Promise<PullRequestComment[]> }
	>();

	getIsMatchingRemotePredicate() {
		const baseUrl = this._providerInfo?.data?.baseUrl || this.getConfig().host;
		const configDomain = baseUrl ? URI.parse(baseUrl).authority : "";
		return (r: GitRemote) => configDomain !== "" && r.domain === configDomain;
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
					? this._getCommentsForPathCore(filePath, relativePath, remotePath)
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
		remotePaths: string[]
	) {
		const comments = [];

		for (const remotePath of remotePaths) {
			const pullRequestsResponse = await this.get<GetPullRequestsResponse>(
				`/repositories/${remotePath}/pullrequests?${qs.stringify({ q: "comment_count>0" })}`
			);

			const prComments = (
				await Promise.all(
					pullRequestsResponse.body.values.map(pr => this._getPullRequestComments(pr, relativePath))
				)
			).reduce((group, current) => group.concat(current), []);

			comments.push(...prComments);
		}

		// If we have any comments, fire a notification
		if (comments.length !== 0) {
			void SessionContainer.instance().documentMarkers.fireDidChangeDocumentMarkers(
				URI.file(filePath).toString(),
				"codemarks"
			);
		}

		return comments;
	}

	private async _getPullRequestComments(
		pr: BitbucketPullRequest,
		filePath: string
	): Promise<PullRequestComment[]> {
		return [];
	}
}

interface BitbucketServerCreatePullRequestRequest {
	fromRef: {
		id: string;
		repository: {
			project: {
				key: string;
			};
			slug: string;
		};
	};
	toRef: {
		id: string;
		repository: {
			project: {
				key: string;
			};
			slug: string;
		};
	};
	title: string;
	description?: string;
}

interface BitbucketServerCreatePullRequestResponse {
	id: string;
	links: { self: { href: string }[] };
	number: number;
	title: string;
}

interface BitbucketServerBranch {
	displayId: string;
	type: string;
	isDefault: boolean;
}

interface BitbucketServerRepo {
	id: string;
	project: {
		key: string;
	};
	mainbranch?: {
		name?: string;
		type?: string;
	};
}
