"use strict";

import { structuredPatch } from "diff";
import * as fs from "fs";
import path from "path";
import { Container, SessionContainer } from "../container";
import { calculateLocation, MAX_RANGE_VALUE } from "../markerLocation/calculator";
import {
	ResolveStackTracePositionRequest,
	ResolveStackTracePositionRequestType,
	ResolveStackTracePositionResponse,
	ResolveStackTraceRequest,
	ResolveStackTraceRequestType,
	ResolveStackTraceResponse
} from "../protocol/agent.protocol";
import { CSStackTraceLine } from "../protocol/api.protocol.models";
import { CodeStreamSession } from "../session";
import { log } from "../system/decorators/log";
import { lsp, lspHandler } from "../system/decorators/lsp";
import { Strings } from "../system/string";
import { xfs } from "../xfs";
import { GitRepository } from "../git/models/models";

@lsp
export class NRManager {
	constructor(readonly session: CodeStreamSession) {}

	@log()
	@lspHandler(ResolveStackTraceRequestType)
	async resolveStackTrace({
		stackTrace,
		repoRemote,
		sha
	}: ResolveStackTraceRequest): Promise<ResolveStackTraceResponse> {
		// …v/sandboxes/csbe/codestream-server/api_server/modules/codemarks/codemark_creator.js:21:9
		const response: ResolveStackTraceResponse = { lines: [] };
		const matchingRepo = await this.getMatchingRepo(repoRemote);
		if (!matchingRepo)
			return { ...response, error: `Unable to find repo with remote ${repoRemote}` };
		response.repoId = matchingRepo.id;
		response.sha = sha;

		const allFilePaths = this.getAllFiles(matchingRepo.path);

		for (const rawLine of stackTrace) {
			const line = await this.resolveStackTraceLine(rawLine, sha, allFilePaths, matchingRepo);
			response.lines.push(line);
		}

		return response;
	}

	@log()
	@lspHandler(ResolveStackTracePositionRequestType)
	async resolveStackTracePosition({
		sha,
		filePath,
		line,
		column
	}: ResolveStackTracePositionRequest): Promise<ResolveStackTracePositionResponse> {
		return this.getCurrentStackTracePosition(sha, filePath, line, column);
	}

	private getBestMatchingPath(pathSuffix: string, allFilePaths: string[]) {
		const pathSuffixParts = pathSuffix
			.split("/")
			.slice()
			.reverse();
		let bestMatchingFilePath = undefined;
		let bestMatchingScore = 0;

		for (const filePath of allFilePaths) {
			const filePathParts = filePath
				.split("/")
				.slice()
				.reverse();

			for (let i = 0; i < pathSuffixParts.length; i++) {
				if (pathSuffixParts[i] !== filePathParts[i]) {
					if (i > bestMatchingScore) {
						bestMatchingScore = i;
						bestMatchingFilePath = filePath;
					}
					break;
				}
			}
		}
		return bestMatchingFilePath;
	}

	private async getMatchingRepo(repoRemote: string) {
		const { git } = SessionContainer.instance();
		const gitRepos = await git.getRepositories();
		let matchingRepo = undefined;

		for (const gitRepo of gitRepos) {
			const remotes = await git.getRepoRemotes(gitRepo.path);
			for (const remote of remotes) {
				let compareRepo = repoRemote.toLowerCase();
				if (!compareRepo.startsWith("ssh://")) {
					compareRepo = `ssh://${compareRepo}`;
				}
				if (remote.uri.toString().toLowerCase() === compareRepo) {
					matchingRepo = gitRepo;
					break;
				}
			}
		}
		return matchingRepo;
	}

	private async resolveStackTraceLine(
		rawLine: string,
		sha: string,
		allFilePaths: string[],
		matchingRepo: GitRepository
	): Promise<CSStackTraceLine> {
		const [pathSuffix, line, column] = rawLine.split(":");

		const bestMatchingFilePath = this.getBestMatchingPath(pathSuffix, allFilePaths);
		if (!bestMatchingFilePath)
			return { error: `Unable to find matching file for path suffix ${pathSuffix}` };

		const position = await this.getCurrentStackTracePosition(
			sha,
			bestMatchingFilePath,
			parseInt(line, 10),
			parseInt(column, 10)
		);
		if (position.error) {
			return { error: position.error };
		}

		return {
			fileFullPath: bestMatchingFilePath,
			fileRelativePath: path.relative(matchingRepo.path, bestMatchingFilePath),
			line: position.line,
			column: position.column
		};
	}

	private async getCurrentStackTracePosition(
		sha: string,
		filePath: string,
		line: number,
		column: number
	) {
		const { git } = SessionContainer.instance();
		const { documents } = Container.instance();

		const diffToHead = await git.getDiffBetweenCommits(sha, "HEAD", filePath, true);

		if (!diffToHead) return { error: `Unable to calculated diff from ${sha} to HEAD` };

		const currentCommitLocation = await calculateLocation(
			{
				id: "nrError",
				lineStart: line,
				colStart: column,
				lineEnd: line,
				colEnd: MAX_RANGE_VALUE
			},
			diffToHead
		);

		const currentCommitText = await git.getFileContentForRevision(filePath, "HEAD");
		if (!currentCommitText) return { error: `Unable to read current HEAD contents of ${filePath}` };

		const doc = documents.get("file://" + filePath);
		let currentBufferText = doc && doc.getText();
		if (currentBufferText == null) {
			currentBufferText = await xfs.readText(filePath);
		}
		if (!currentBufferText)
			return { error: `Unable to read current buffer contents of ${filePath}` };

		const diffToCurrentContents = structuredPatch(
			filePath,
			filePath,
			Strings.normalizeFileContents(currentCommitText),
			Strings.normalizeFileContents(currentBufferText),
			"",
			""
		);

		const currentBufferLocation = await calculateLocation(
			currentCommitLocation,
			diffToCurrentContents
		);

		return {
			line: currentBufferLocation.lineStart,
			column: currentBufferLocation.colStart
		};
	}

	private getAllFiles(dirPath: string, arrayOfFiles?: string[] | undefined): string[] {
		arrayOfFiles = arrayOfFiles || [];
		const files = fs.readdirSync(dirPath);
		for (const file of files) {
			// For demo purposes!!!
			if (!file.match(/node_modules/)) {
				const filePath = path.join(dirPath, file);
				if (fs.statSync(filePath).isDirectory()) {
					arrayOfFiles = this.getAllFiles(filePath, arrayOfFiles);
				} else {
					arrayOfFiles!.push(filePath);
				}
			}
		}
		return arrayOfFiles;
	}
}
