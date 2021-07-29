"use strict";

import { structuredPatch } from "diff";
import * as fs from "fs";
import path from "path";
import { Container, SessionContainer } from "../container";
import { calculateLocation, MAX_RANGE_VALUE } from "../markerLocation/calculator";
import {
	AddNewRelicIncludeRequest,
	AddNewRelicIncludeRequestType,
	AddNewRelicIncludeResponse,
	CreateNewRelicConfigFileRequest,
	CreateNewRelicConfigFileRequestType,
	CreateNewRelicConfigFileResponse,
	FindCandidateMainFilesRequest,
	FindCandidateMainFilesRequestType,
	FindCandidateMainFilesResponse,
	InstallNewRelicRequest,
	InstallNewRelicRequestType,
	InstallNewRelicResponse,
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
import { spawnSync } from "child_process";

interface CandidateFiles {
	packageJson: string | null;
	indexFiles: string[];
	jsFiles: string[];
}

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
		if (!matchingRepo) {
			// Repo **codestream-server** not found in your editor. Open it in order to navigate the stack trace.
			let repoName = repoRemote;
			try {
				repoName = repoRemote.split("/").reverse()[0];
			} catch {}
			return {
				...response,
				error: `Repo ${repoName} not found in your editor. Open it in order to navigate the stack trace.`
			};
		}
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

	@log()
	@lspHandler(FindCandidateMainFilesRequestType)
	async findCandidateMainFiles({
		type,
		path
	}: FindCandidateMainFilesRequest): Promise<FindCandidateMainFilesResponse> {
		switch (type) {
			case "nodejs": {
				return this.findNodeJSCandidateMainFiles(path);
			}
			default:
				return { error: "unknown type: " + type, files: [] };
		}
	}

	@log()
	@lspHandler(InstallNewRelicRequestType)
	async installNewRelic({ type, cwd }: InstallNewRelicRequest): Promise<InstallNewRelicResponse> {
		switch (type) {
			case "nodejs": {
				return this.installNodeJSNewRelic(cwd);
			}
			default:
				return { error: "unknown type: " + type };
		}
	}

	@log()
	@lspHandler(CreateNewRelicConfigFileRequestType)
	async createNewRelicConfigFile({
		type,
		filePath,
		licenseKey,
		appName
	}: CreateNewRelicConfigFileRequest): Promise<CreateNewRelicConfigFileResponse> {
		switch (type) {
			case "nodejs": {
				return this.createNodeJSNewRelicConfigFile(filePath, licenseKey, appName);
			}
			default:
				return { error: "unknown type: " + type };
		}
	}

	@log()
	@lspHandler(AddNewRelicIncludeRequestType)
	async addNewRelicInclude({
		type,
		file,
		dir
	}: AddNewRelicIncludeRequest): Promise<AddNewRelicIncludeResponse> {
		switch (type) {
			case "nodejs": {
				return this.addNodeJSNewRelicInclude(file, dir);
			}
			default:
				return { error: "unknown type: " + type };
		}
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

	private findNodeJSCandidateMainFiles(dirPath: string) {
		const files: CandidateFiles = {
			packageJson: null,
			indexFiles: [],
			jsFiles: []
		};

		const packageJson = path.join(dirPath, "package.json");
		if (fs.existsSync(packageJson)) {
			const json = fs.readFileSync(packageJson, { encoding: "utf8" });
			let data;
			try {
				data = JSON.parse(json);
			} catch (error) {}
			if (data && data.main) {
				const mainFile = path.join(dirPath, data.main);
				if (fs.existsSync(mainFile)) {
					files.packageJson = data.main;
				}
			}
		}

		this._findNodeJSCandidateMainFiles(dirPath, dirPath, files, 0, 2);

		const arrayOfFiles: string[] = [];
		if (files.packageJson) {
			arrayOfFiles.push(files.packageJson);
		}

		return { files: [...arrayOfFiles, ...files.indexFiles, ...files.jsFiles] };
	}

	private _findNodeJSCandidateMainFiles(
		dirPath: string,
		mainPath: string,
		files: CandidateFiles,
		depth: number,
		maxDepth: number
	) {
		const allFiles = fs.readdirSync(dirPath);
		for (const file of allFiles) {
			// For demo purposes!!!
			if (!file.match(/node_modules/)) {
				const filePath = path.join(dirPath, file);
				if (fs.statSync(filePath).isDirectory() && (!maxDepth || depth !== maxDepth)) {
					this._findNodeJSCandidateMainFiles(filePath, mainPath, files, depth + 1, maxDepth);
				} else if (path.basename(filePath) === "index.js") {
					files.indexFiles.push(filePath.substring(mainPath.length + 1));
				} else if (path.extname(filePath) === ".js") {
					files.jsFiles.push(filePath.substring(mainPath.length + 1));
				}
			}
		}

		return files;
	}

	private async installNodeJSNewRelic(cwd: string): Promise<InstallNewRelicResponse> {
		// FIXME does this work in windows???
		return new Promise(resolve => {
			try {
				const result = spawnSync("npm", ["install", "--save", "newrelic"], {
					cwd
					/* This is what Colin needs to run this as a demo locally
					shell: "/bin/zsh",
					env: {
						PATH: `${process.env.PATH}:/Users/cstryker/dev/sandboxes/csbe/node/bin`
					}
					*/
				});
				if (result.error) {
					resolve({ error: `unable to execute npm install: ${result.error.message}` });
				} else {
					resolve({});
				}
			} catch (error) {
				const msg = error instanceof Error ? error.message : JSON.stringify(error);
				resolve({ error: `exception throw executing npm install: ${msg}` });
			}
		});
	}

	private async createNodeJSNewRelicConfigFile(
		filePath: string,
		licenseKey: string,
		appName: string
	): Promise<CreateNewRelicConfigFileResponse> {
		try {
			const configFile = path.join(filePath, "node_modules", "newrelic", "newrelic.js");
			if (!fs.existsSync(configFile)) {
				return { error: `could not find default config file: ${configFile}` };
			}
			let config = fs.readFileSync(configFile, "utf8");
			config = config
				.replace("license_key: 'license key here'", `license_key: '${licenseKey}'`)
				.replace("app_name: ['My Application']", `app_name: ['${appName}']`);

			const newConfigFile = path.join(filePath, "newrelic.js");
			fs.writeFileSync(newConfigFile, config, { encoding: "utf8" });
			return {};
		} catch (error) {
			const msg = error instanceof Error ? error.message : JSON.stringify(error);
			return { error: `caught ${msg}` };
		}
	}

	private async addNodeJSNewRelicInclude(
		file: string,
		dir: string
	): Promise<AddNewRelicIncludeResponse> {
		try {
			const fullPath = path.join(dir, file);
			let contents = fs.readFileSync(fullPath, "utf8");
			contents = `require("newrelic");\n\n${contents}`;
			fs.writeFileSync(fullPath, contents, { encoding: "utf8" });
			return {};
		} catch (error) {
			const msg = error instanceof Error ? error.message : JSON.stringify(error);
			return { error: `caught ${msg}` };
		}
	}
}
