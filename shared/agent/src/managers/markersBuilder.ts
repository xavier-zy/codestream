"use strict";

import * as path from "path";
import { Range, TextDocumentIdentifier } from "vscode-languageserver";
import { URI } from "vscode-uri";
import { Marker, MarkerLocation, Ranges } from "../api/extensions";
import { Container, SessionContainer } from "../container";
import { Logger } from "../logger";
import { calculateLocation } from "../markerLocation/calculator";
import { CodeStreamDiffUriData } from "../protocol/agent.protocol";
import { CreateMarkerRequest } from "../protocol/agent.protocol.codemarks";
import { CodeBlockSource } from "../protocol/agent.protocol.posts";
import { CSReviewCheckpoint } from "../protocol/api.protocol";
import { CSMarkerLocation, CSReferenceLocation } from "../protocol/api.protocol.models";
import * as csUri from "../system/uri";
import { xfs } from "../xfs";
import { ReviewsManager } from "./reviewsManager";
import { ScmManager } from "./scmManager";

export abstract class MarkersBuilder {
	static newBuilder(documentId: TextDocumentIdentifier) {
		if (documentId.uri.startsWith("codestream-diff://")) {
			if (csUri.Uris.isCodeStreamDiffUri(documentId.uri)) {
				return new CodeStreamDiffMarkersBuilder(documentId);
			}
			return new ReviewDiffMarkersBuilder(documentId);
		} else {
			return new DefaultMarkersBuilder(documentId);
		}
	}

	protected readonly _documentId: TextDocumentIdentifier;
	protected readonly _documentUri: URI;

	protected constructor(documentId: TextDocumentIdentifier) {
		this._documentId = documentId;
		this._documentUri = URI.parse(documentId.uri);
	}

	async build(
		code: string,
		range: Range,
		source?: CodeBlockSource
	): Promise<MarkerCreationDescriptor> {
		const { scm } = SessionContainer.instance();
		let marker: CreateMarkerRequest | undefined;

		Logger.log("prepareMarkerCreationDescriptor: creating post with associated range");
		range = Ranges.ensureStartBeforeEnd(range);
		const location = MarkerLocation.fromRange(range);

		const {
			referenceLocations,
			backtrackedLocation,
			fileCurrentCommitSha
		} = await this.getLocationInfo(source, location);
		const remotes = this.getRemotes(source);
		const repoIdentifier = await this.getRepoIdentifier(source);
		const remoteCodeUrl = await this.getRemoteCodeUrl(scm, range, code, remotes);
		marker = {
			code,
			commitHash: fileCurrentCommitSha,
			referenceLocations,
			branchWhenCreated: (source && source.branch) || undefined,
			remotes: remotes,
			remoteCodeUrl,
			...repoIdentifier
		};

		Logger.log(`prepareMarkerCreationDescriptor: preparation complete`);
		return {
			marker,
			uncommittedBacktrackedLocation: backtrackedLocation
		};
	}

	protected abstract getLocationInfo(
		source: CodeBlockSource | undefined,
		location: CSMarkerLocation
	): Promise<{
		referenceLocations: CSReferenceLocation[];
		backtrackedLocation?: UncommittedBacktrackedLocation;
		fileCurrentCommitSha?: string;
	}>;

	private getRemotes(source: CodeBlockSource | undefined) {
		if (source && source.remotes && source.remotes.length > 0) {
			return source.remotes.map(r => r.url);
		}
		return undefined;
	}

	private async getRepoIdentifier(source?: CodeBlockSource): Promise<RepoIdentifier> {
		if (source == null || source.file == null) {
			Logger.log(`prepareMarkerCreationDescriptor: marker has no source file`);
			return {};
		}

		Logger.log(`prepareMarkerCreationDescriptor: identifying stream for file ${source.file}`);
		const { git, files } = SessionContainer.instance();
		const fullPath = path.join(source.repoPath, source.file);
		const stream = await files.getByPath(fullPath);
		if (stream && stream.id) {
			Logger.log(`prepareMarkerCreationDescriptor: stream id=${stream.id}`);
			return {
				fileStreamId: stream.id
			};
		}

		Logger.log(`prepareMarkerCreationDescriptor: no stream id found`);
		const identifier: RepoIdentifier = {};
		identifier.file = source.file;
		const repo = await git.getRepositoryByFilePath(fullPath);
		if (repo && repo.id) {
			Logger.log(`prepareMarkerCreationDescriptor: repo id=${repo.id}`);
			identifier.repoId = repo.id;
		} else {
			identifier.knownCommitHashes = await git.getKnownCommitHashes(source.repoPath);
			Logger.log(
				`prepareMarkerCreationDescriptor: known commit hashes = ${identifier.knownCommitHashes.join(
					", "
				)}`
			);
		}

		return identifier;
	}

	private async getRemoteCodeUrl(
		scm: ScmManager,
		range: Range,
		code: string,
		remotes: string[] | undefined
	) {
		try {
			Logger.log(`prepareMarkerCreationDescriptor: retrieving range information`);
			const scmResponse = await scm.getRangeInfo({
				uri: this._documentId.uri,
				range: range,
				contents: code,
				skipBlame: true
			});

			if (remotes !== undefined && scmResponse.scm !== undefined && scmResponse.scm.revision) {
				for (const remote of remotes) {
					const remoteCodeUrl = Marker.getRemoteCodeUrl(
						remote,
						scmResponse.scm.revision,
						scmResponse.scm.file,
						scmResponse.range.start.line + 1,
						scmResponse.range.end.line + 1
					);

					if (remoteCodeUrl !== undefined) {
						Logger.log(`prepareMarkerCreationDescriptor: remote code URL = ${remoteCodeUrl}`);
						return remoteCodeUrl;
					}
				}
			}
		} catch (ex) {
			Logger.error(ex);
		}
		return undefined;
	}
}

class DefaultMarkersBuilder extends MarkersBuilder {
	constructor(documentId: TextDocumentIdentifier) {
		super(documentId);
	}

	protected async getLocationInfo(
		source: CodeBlockSource | undefined,
		location: CSMarkerLocation
	): Promise<{
		referenceLocations: CSReferenceLocation[];
		backtrackedLocation?: UncommittedBacktrackedLocation;
		fileCurrentCommitSha?: string;
	}> {
		if (source == null) return this.getLocationInfoWithoutSource();
		if (source.revision == null) {
			return this.getLocationInfoWithoutRevision(source.repoPath, location);
		}
		return this.getLocationInfoCore(source.repoPath, source.revision, location);
	}

	private getLocationInfoWithoutSource() {
		return {
			referenceLocations: []
		};
	}

	private async getLocationInfoWithoutRevision(repoPath: string, location: CSMarkerLocation) {
		Logger.log(`prepareMarkerCreationDescriptor: no source revision - file has no commits`);
		const { git } = SessionContainer.instance();

		const repoHead = await git.getRepoHeadRevision(repoPath);
		if (repoHead == null) throw new Error(`Cannot determine HEAD revision for ${repoPath}`);

		return {
			referenceLocations: [
				{
					commitHash: repoHead,
					location: MarkerLocation.toArray(MarkerLocation.empty()),
					flags: {
						unversionedFile: true
					}
				}
			],
			backtrackedLocation: {
				atDocument: location,
				fileContents: await this.getFileContents(),
				filePath: this._documentUri.fsPath
			},
			fileCurrentCommitSha: repoHead
		};
	}

	private async getLocationInfoCore(
		repoPath: string,
		fileCurrentCommitSha: string,
		location: CSMarkerLocation
	): Promise<{
		referenceLocations: CSReferenceLocation[];
		backtrackedLocation?: UncommittedBacktrackedLocation;
		fileCurrentCommitSha?: string;
	}> {
		Logger.log(`prepareMarkerCreationDescriptor: source revision ${fileCurrentCommitSha}`);

		const { git } = SessionContainer.instance();

		const fileContents = await this.getFileContents();
		const locationAtCurrentCommit = await SessionContainer.instance().markerLocations.backtrackLocation(
			this._documentId,
			fileContents,
			location,
			fileCurrentCommitSha
		);
		Logger.log(
			`prepareMarkerCreationDescriptor: location at current commit ${MarkerLocation.toArray(
				locationAtCurrentCommit
			)}`
		);

		const filePath = this._documentUri.fsPath;
		const blameRevisionsPromises = git.getBlameRevisions(filePath, {
			ref: fileCurrentCommitSha,
			// it expects 0-based ranges
			startLine: locationAtCurrentCommit.lineStart - 1,
			endLine: locationAtCurrentCommit.lineEnd - 1,
			retryWithTrimmedEndOnFailure: true
		});

		const remoteDefaultBranchRevisionsPromises = git.getRemoteDefaultBranchHeadRevisions(repoPath);
		const backtrackShas = [
			...(await blameRevisionsPromises).map(revision => revision.sha),
			...(await remoteDefaultBranchRevisionsPromises)
		].filter(function(sha, index, self) {
			return sha !== fileCurrentCommitSha && index === self.indexOf(sha);
		});
		Logger.log(
			`prepareMarkerCreationDescriptor: backtracking location to ${backtrackShas.length} revisions`
		);

		const promises = backtrackShas.map(async (sha, index) => {
			const diff = await git.getDiffBetweenCommits(fileCurrentCommitSha!, sha, filePath);
			const location = await calculateLocation(locationAtCurrentCommit!, diff!);
			const locationArray = MarkerLocation.toArray(location);
			Logger.log(`prepareMarkerCreationDescriptor: backtracked at ${sha} to ${locationArray}`);
			return {
				commitHash: sha,
				location: locationArray,
				flags: {
					backtracked: true
				}
			};
		});

		const meta = locationAtCurrentCommit.meta || {};
		const canonical = !meta.startWasDeleted && !meta.endWasDeleted;
		const referenceLocation = {
			commitHash: fileCurrentCommitSha,
			location: MarkerLocation.toArray(locationAtCurrentCommit),
			flags: {
				canonical,
				backtracked: !canonical
			}
		};
		const backtrackedLocations = await Promise.all(promises);
		const referenceLocations = [referenceLocation, ...backtrackedLocations];
		Logger.log(
			`prepareMarkerCreationDescriptor: ${referenceLocations.length} reference locations calculated`
		);

		let backtrackedLocation: UncommittedBacktrackedLocation | undefined;
		if (!canonical) {
			backtrackedLocation = {
				atCurrentCommit: locationAtCurrentCommit,
				atDocument: location,
				fileContents,
				filePath
			};
		}

		return {
			referenceLocations,
			backtrackedLocation,
			fileCurrentCommitSha
		};
	}

	private async getFileContents() {
		const { documents } = Container.instance();

		const document = documents.get(this._documentId.uri);
		const filePath = this._documentUri.fsPath;
		const fileContents = document ? document.getText() : await xfs.readText(filePath);
		if (fileContents === undefined) {
			throw new Error(
				`prepareMarkerCreationDescriptor: Could not retrieve contents for ${this._documentId.uri} from document manager or file system. File does not exist in current branch.`
			);
		}

		return fileContents;
	}
}

class CodeStreamDiffMarkersBuilder extends MarkersBuilder {
	private readonly codeStreamDiffUri: CodeStreamDiffUriData;

	constructor(documentId: TextDocumentIdentifier) {
		super(documentId);
		this.codeStreamDiffUri = csUri.Uris.fromCodeStreamDiffUri<CodeStreamDiffUriData>(
			documentId.uri
		)!;
	}

	protected async getLocationInfo(
		source: CodeBlockSource | undefined,
		location: CSMarkerLocation
	): Promise<{
		referenceLocations: CSReferenceLocation[];
		backtrackedLocation?: UncommittedBacktrackedLocation;
		fileCurrentCommitSha?: string;
	}> {
		if (source == null) return this.getLocationInfoWithoutSource();
		if (source.revision == null) {
			return this.getLocationInfoWithoutRevision(source.repoPath, location);
		}
		return this.getLocationInfoCore(source.repoPath, source.revision, location);
	}

	private getLocationInfoWithoutSource() {
		return {
			referenceLocations: []
		};
	}

	private async getLocationInfoWithoutRevision(repoPath: string, location: CSMarkerLocation) {
		Logger.log(`prepareMarkerCreationDescriptor: no source revision - file has no commits`);
		const { git } = SessionContainer.instance();

		const repoHead = await git.getRepoHeadRevision(repoPath);
		if (repoHead == null) throw new Error(`Cannot determine HEAD revision for ${repoPath}`);

		const filePath = path.join(repoPath, this.codeStreamDiffUri.path);

		return {
			referenceLocations: [
				{
					commitHash: repoHead,
					location: MarkerLocation.toArray(MarkerLocation.empty()),
					flags: {
						unversionedFile: true
					}
				}
			],
			backtrackedLocation: {
				atDocument: location,
				fileContents: await this.getFileContents(),
				filePath: filePath
			},
			fileCurrentCommitSha: repoHead
		};
	}

	private async getLocationInfoCore(
		repoPath: string,
		fileCurrentCommitSha: string,
		location: CSMarkerLocation
	): Promise<{
		referenceLocations: CSReferenceLocation[];
		backtrackedLocation?: UncommittedBacktrackedLocation;
		fileCurrentCommitSha?: string;
	}> {
		Logger.log(`prepareMarkerCreationDescriptor: source revision ${fileCurrentCommitSha}`);

		const { git } = SessionContainer.instance();

		const fileContents = await this.getFileContents();
		const locationAtCurrentCommit = await SessionContainer.instance().markerLocations.backtrackLocation(
			this._documentId,
			fileContents,
			location,
			fileCurrentCommitSha
		);
		Logger.log(
			`prepareMarkerCreationDescriptor: location at current commit ${MarkerLocation.toArray(
				locationAtCurrentCommit
			)}`
		);

		const filePath = path.join(repoPath, this.codeStreamDiffUri.path);

		const blameRevisionsPromises = git.getBlameRevisions(filePath, {
			ref: fileCurrentCommitSha,
			// it expects 0-based ranges
			startLine: locationAtCurrentCommit.lineStart - 1,
			endLine: locationAtCurrentCommit.lineEnd - 1,
			retryWithTrimmedEndOnFailure: true
		});
		const remoteDefaultBranchRevisionsPromises = git.getRemoteDefaultBranchHeadRevisions(repoPath, [
			"upstream",
			"origin"
		]);
		const backtrackShas = [
			...(await blameRevisionsPromises).map(revision => revision.sha),
			...(await remoteDefaultBranchRevisionsPromises)
		].filter(function(sha, index, self) {
			return sha !== fileCurrentCommitSha && index === self.indexOf(sha);
		});
		Logger.log(
			`prepareMarkerCreationDescriptor: backtracking location to ${backtrackShas.length} revisions`
		);

		const promises = backtrackShas.map(async (sha, index) => {
			const diff = await git.getDiffBetweenCommits(fileCurrentCommitSha!, sha, filePath);
			const location = await calculateLocation(locationAtCurrentCommit!, diff!);
			const locationArray = MarkerLocation.toArray(location);
			Logger.log(`prepareMarkerCreationDescriptor: backtracked at ${sha} to ${locationArray}`);
			return {
				commitHash: sha,
				location: locationArray,
				flags: {
					backtracked: true
				}
			};
		});

		const meta = locationAtCurrentCommit.meta || {};
		const canonical = !meta.startWasDeleted && !meta.endWasDeleted;
		const referenceLocation = {
			commitHash: fileCurrentCommitSha,
			location: MarkerLocation.toArray(locationAtCurrentCommit),
			flags: {
				canonical,
				backtracked: !canonical
			}
		};
		const backtrackedLocations = await Promise.all(promises);
		const referenceLocations = [referenceLocation, ...backtrackedLocations];
		Logger.log(
			`prepareMarkerCreationDescriptor: ${referenceLocations.length} reference locations calculated`
		);

		let backtrackedLocation: UncommittedBacktrackedLocation | undefined;
		if (!canonical) {
			backtrackedLocation = {
				atCurrentCommit: locationAtCurrentCommit,
				atDocument: location,
				fileContents,
				filePath
			};
		}

		return {
			referenceLocations,
			backtrackedLocation,
			fileCurrentCommitSha
		};
	}

	private async getFileContents() {
		const { git } = SessionContainer.instance();

		const repo = await git.getRepositoryById(this.codeStreamDiffUri.repoId);
		if (!repo) {
			throw new Error(`Could not load repo with ID ${this.codeStreamDiffUri.repoId}`);
		}

		const fullPath = path.join(repo.path, this.codeStreamDiffUri.path);

		const contents = await git.getFileContentForRevision(
			URI.parse(fullPath),
			this.codeStreamDiffUri.side === "left"
				? this.codeStreamDiffUri.leftSha
				: this.codeStreamDiffUri.rightSha
		);

		return contents || "";
	}
}

class ReviewDiffMarkersBuilder extends MarkersBuilder {
	private _reviewId: string;
	private _checkpoint: CSReviewCheckpoint;
	private _repoId: string;
	private _version: string;
	private _path: string;

	constructor(documentId: TextDocumentIdentifier) {
		super(documentId);

		const { reviewId, checkpoint, repoId, version, path } = ReviewsManager.parseUri(documentId.uri);
		this._reviewId = reviewId;
		this._checkpoint = checkpoint;
		this._repoId = repoId;
		this._version = version;
		this._path = path;
	}

	protected async getLocationInfo(
		source: CodeBlockSource | undefined,
		location: CSMarkerLocation
	): Promise<{
		referenceLocations: CSReferenceLocation[];
		backtrackedLocation?: UncommittedBacktrackedLocation;
		fileCurrentCommitSha?: string;
	}> {
		const { reviews } = SessionContainer.instance();
		const review = await reviews.getById(this._reviewId);

		const changeset =
			this._checkpoint !== undefined
				? review.reviewChangesets.find(
						c => c.repoId === this._repoId && c.checkpoint === this._checkpoint
				  )
				: review.reviewChangesets
						.slice()
						.reverse()
						.find(c => c.repoId === this._repoId);

		if (!changeset) throw new Error(`Could not find changeset with repoId ${this._repoId}`);

		const diffs = await reviews.getDiffs(this._reviewId, this._repoId);
		const diffCheckpoint = diffs.find(_ => _.checkpoint === changeset.checkpoint)!;
		const fromLatestCommitDiff = diffCheckpoint.diff.latestCommitToRightDiffs.find(
			d => d.newFileName === this._path
		);
		const toLatestCommitDiff = diffCheckpoint.diff.rightToLatestCommitDiffs.find(
			d => d.newFileName === this._path
		);
		const toBaseCommitDiff = diffCheckpoint.diff.rightReverseDiffs.find(
			d => d.newFileName === this._path
		);

		const latestCommitLocation = toLatestCommitDiff
			? await calculateLocation(location, toLatestCommitDiff)
			: location;
		const baseCommitLocation = toBaseCommitDiff
			? await calculateLocation(location, toBaseCommitDiff)
			: location;

		const latestCommitSha = diffCheckpoint.diff.latestCommitSha;
		const referenceLocations: CSReferenceLocation[] = [];

		if (fromLatestCommitDiff != null) {
			referenceLocations.push({
				commitHash: undefined,
				flags: {
					canonical: true,
					uncommitted: true,
					baseCommit: latestCommitSha,
					diff: fromLatestCommitDiff
				},
				location: MarkerLocation.toArray(location)
			});
		}

		referenceLocations.push({
			commitHash: latestCommitSha,
			flags: { canonical: toLatestCommitDiff == null },
			location: MarkerLocation.toArray(latestCommitLocation)
		});
		referenceLocations.push({
			commitHash: diffCheckpoint.diff.rightBaseSha,
			flags: { backtracked: true },
			location: MarkerLocation.toArray(baseCommitLocation)
		});

		return {
			referenceLocations,
			fileCurrentCommitSha: latestCommitSha
		};
	}
}

export interface UncommittedBacktrackedLocation {
	atDocument: CSMarkerLocation;
	atCurrentCommit?: CSMarkerLocation;
	fileContents: string;
	filePath: string;
}

export interface MarkerCreationDescriptor {
	marker: CreateMarkerRequest;
	uncommittedBacktrackedLocation: UncommittedBacktrackedLocation | undefined;
}

interface RepoIdentifier {
	knownCommitHashes?: string[];
	repoId?: string;
	file?: string;
	fileStreamId?: string;
}
