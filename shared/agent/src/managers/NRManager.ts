"use strict";

import { structuredPatch } from "diff";
import path from "path";
import { promises as fsPromises } from "fs";
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
	ParseStackTraceRequest,
	ParseStackTraceRequestType,
	ParseStackTraceResponse,
	ResolveStackTracePositionRequest,
	ResolveStackTracePositionRequestType,
	ResolveStackTracePositionResponse,
	ResolveStackTraceRequest,
	ResolveStackTraceRequestType,
	ResolveStackTraceResponse
} from "../protocol/agent.protocol";
import { CSStackTraceInfo, CSStackTraceLine } from "../protocol/api.protocol.models";
import { CodeStreamSession } from "../session";
import { log } from "../system/decorators/log";
import { lsp, lspHandler } from "../system/decorators/lsp";
import { Strings } from "../system/string";
import { xfs } from "../xfs";
import { GitRepository } from "../git/models/models";
import { Logger } from "../logger";
import { RepoProjectType } from "../protocol/agent.protocol.scm";

import { Parser as javascriptParser } from "./stackTraceParsers/javascriptStackTraceParser";
import { Parser as rubyParser } from "./stackTraceParsers/rubyStackTraceParser";
import { Parser as phpParser } from "./stackTraceParsers/phpStackTraceParser";
import { Parser as pythonParser } from "./stackTraceParsers/pythonStackTraceParser";
import { Parser as csharpParser } from "./stackTraceParsers/csharpStackTraceParser";
import { Parser as javaParser } from "./stackTraceParsers/javaStackTraceParser";
import { Parser as goParser } from "./stackTraceParsers/goStackTraceParser";

import { NodeJSInstrumentation } from "./newRelicInstrumentation/nodeJSInstrumentation";
import { JavaInstrumentation } from "./newRelicInstrumentation/javaInstrumentation";
import { DotNetCoreInstrumentation } from "./newRelicInstrumentation/dotNetCoreInstrumentation";

interface CandidateFiles {
	packageJson: string | null;
	indexFiles: string[];
	jsFiles: string[];
}

const ExtensionToLanguageMap: { [key: string]: string } = {
	js: "javascript",
	rb: "ruby",
	php: "php",
	cs: "c#",
	py: "python",
	java: "java",
	go: "go"
};

type Parser = (stack: string) => CSStackTraceInfo;

const StackTraceParsers: { [key: string]: Parser } = {
	javascript: javascriptParser,
	ruby: rubyParser,
	php: phpParser,
	"c#": csharpParser,
	python: pythonParser,
	java: javaParser,
	go: goParser
};

const MISSING_SHA_MESSAGE =
	"Your version of the code doesn't match production. Fetch the following commit to better investigate the error.\n${sha}";

@lsp
export class NRManager {
	_nodeJS: NodeJSInstrumentation;
	_java: JavaInstrumentation;
	_dotNetCore: DotNetCoreInstrumentation;

	constructor(readonly session: CodeStreamSession) {
		this._nodeJS = new NodeJSInstrumentation(session);
		this._java = new JavaInstrumentation(session);
		this._dotNetCore = new DotNetCoreInstrumentation(session);
	}

	// returns info gleaned from parsing a stack trace
	@lspHandler(ParseStackTraceRequestType)
	@log()
	async parseStackTrace({ stackTrace }: ParseStackTraceRequest): Promise<ParseStackTraceResponse> {
		const lines: string[] = typeof stackTrace === "string" ? stackTrace.split("\n") : stackTrace;
		const whole = lines.join("\n");

		// TODO: once we are fetching these stack traces from NR, or once we know the NR entity that was
		// associated with generating the stack trace and can thereby infer the language, we can probably
		// avoid having to determine the language

		// take an educated guess on the language, based on a simple search for file extension,
		// before attempting to parse accoding to the generating language
		let lang = this.guessStackTraceLanguage(lines);
		if (lang) {
			return StackTraceParsers[lang](whole);
		}

		// otherwise we'll go through each in turn and try to parse anyway?
		for (lang in StackTraceParsers) {
			let info;
			try {
				info = StackTraceParsers[lang](whole);
			} catch (error) {
				continue;
			}
			return info;
		}

		throw new Error("unable to parse stack trace, no meaningful data could be extracted");
	}

	// parses the passed stack, tries to determine if any of the user's open repos match it, and if so,
	// given the commit hash of the code for which the stack trace was generated, tries to match each line
	// of the stack trace with a line in the user's repo, given that the user may be on a different commit
	@lspHandler(ResolveStackTraceRequestType)
	@log()
	async resolveStackTrace({
		stackTrace,
		repoRemote,
		sha,
		traceId
	}: ResolveStackTraceRequest): Promise<ResolveStackTraceResponse> {
		const matchingRepo = await this.getMatchingRepo(repoRemote);
		if (!matchingRepo) {
			// Repo **codestream-server** not found in your editor. Open it in order to navigate the stack trace.
			let repoName = repoRemote;
			try {
				repoName = repoRemote.split("/").reverse()[0];
			} catch {}
			repoName = repoName ? repoName + " " : "";
			return {
				warning: `Repo ${repoName}not found in your editor. Open it in order to navigate the stack trace.`
			};
		}
		try {
			const { git } = SessionContainer.instance();
			// ensure this sha is actually valid for this repo
			if (!(await git.isValidReference(matchingRepo.path, sha))) {
				// if not found, attempt to fetch all
				Logger.log(`NRManager sha (${sha}) not found. fetching...`);
				await git.fetchAllRemotes(matchingRepo.path);

				if (!(await git.isValidReference(matchingRepo.path, sha))) {
					// if still not there, we can't continue
					Logger.log(`NRManager sha (${sha}) not found after fetch`);
					return {
						error: Strings.interpolate(MISSING_SHA_MESSAGE, { sha: sha })
					};
				}
			}
		} catch (ex) {
			Logger.warn("NRManager issue locating sha", {
				repoRemote: repoRemote,
				sha: sha
			});
			return {
				error: Strings.interpolate(MISSING_SHA_MESSAGE, { sha: sha })
			};
		}

		const parsedStackInfo = await this.parseStackTrace({ stackTrace });
		if (parsedStackInfo.parseError) {
			return { error: parsedStackInfo.parseError };
		} else if (!parsedStackInfo.lines.find(line => !line.error)) {
			// if there was an error on all lines (for some reason)
			return {
				error: Strings.interpolate(MISSING_SHA_MESSAGE, { sha: sha })
			};
		}
		parsedStackInfo.repoId = matchingRepo.id;
		parsedStackInfo.sha = sha;
		parsedStackInfo.traceId = traceId;

		const allFilePaths = await this.getAllFiles(matchingRepo.path);

		const resolvedStackInfo: CSStackTraceInfo = { ...parsedStackInfo, lines: [] };
		for (const line of parsedStackInfo.lines) {
			const resolvedLine = line.error
				? { ...line }
				: await this.resolveStackTraceLine(line, sha, allFilePaths, matchingRepo);
			resolvedStackInfo.lines.push(resolvedLine);
			line.fileRelativePath = resolvedLine.fileRelativePath;
		}

		return {
			resolvedStackInfo,
			parsedStackInfo
		};
	}

	@lspHandler(ResolveStackTracePositionRequestType)
	@log()
	async resolveStackTracePosition({
		sha,
		repoId,
		filePath,
		line,
		column
	}: ResolveStackTracePositionRequest): Promise<ResolveStackTracePositionResponse> {
		const { git } = SessionContainer.instance();
		const repos = await git.getRepositories();
		let repo;
		for (repo of repos) {
			if (repo.id === repoId) break;
		}
		if (!repo) {
			return { error: "unable to find repo " + repoId };
		}
		const fullPath = path.join(repo.path, filePath);
		const position = await this.getCurrentStackTracePosition(sha, fullPath, line, column);
		return {
			...position,
			path: fullPath
		};
	}

	@lspHandler(FindCandidateMainFilesRequestType)
	@log()
	async findCandidateMainFiles({
		type,
		path
	}: FindCandidateMainFilesRequest): Promise<FindCandidateMainFilesResponse> {
		switch (type) {
			case RepoProjectType.NodeJS:
				return this._nodeJS.findCandidateMainFiles(path);
			default:
				return { error: "unknown type: " + type, files: [] };
		}
	}

	@lspHandler(InstallNewRelicRequestType)
	@log()
	async installNewRelic({ type, cwd }: InstallNewRelicRequest): Promise<InstallNewRelicResponse> {
		let response;
		switch (type) {
			case RepoProjectType.NodeJS:
				response = await this._nodeJS.installNewRelic(cwd);
				break;
			case RepoProjectType.Java:
				response = await this._java.installNewRelic(cwd);
				break;
			case RepoProjectType.DotNetCore:
				response = await this._dotNetCore.installNewRelic(cwd);
				break;
			case RepoProjectType.DotNetFramework:
				return { error: "not implemented. type: " + type };

			default:
				return { error: "unknown type: " + type };
		}
		if (response.error) {
			Logger.warn(response.error);
		}
		return response;
	}

	@lspHandler(CreateNewRelicConfigFileRequestType)
	@log()
	async createNewRelicConfigFile({
		type,
		filePath,
		repoPath,
		licenseKey,
		appName
	}: CreateNewRelicConfigFileRequest): Promise<CreateNewRelicConfigFileResponse> {
		let response;
		switch (type) {
			case RepoProjectType.NodeJS:
				response = await this._nodeJS.createNewRelicConfigFile(filePath, licenseKey, appName);
				break;
			case RepoProjectType.Java:
				response = await this._java.createNewRelicConfigFile(filePath, licenseKey, appName);
				break;
			case RepoProjectType.DotNetCore:
				response = await this._dotNetCore.createNewRelicConfigFile(
					repoPath!,
					filePath,
					licenseKey,
					appName
				);
				break;
			case RepoProjectType.DotNetFramework:
				return { error: "not implemented. type: " + type };

			default:
				return { error: "unknown type: " + type };
		}
		if (response.error) {
			Logger.warn(response.error);
		}
		return response;
	}

	@lspHandler(AddNewRelicIncludeRequestType)
	@log()
	async addNewRelicInclude({
		type,
		file,
		dir
	}: AddNewRelicIncludeRequest): Promise<AddNewRelicIncludeResponse> {
		let response;
		switch (type) {
			case RepoProjectType.NodeJS:
				response = await this._nodeJS.addNewRelicInclude(file, dir);
				break;
			default:
				return { error: "unknown type: " + type };
		}
		if (response.error) {
			Logger.warn(response.error);
		}
		return response;
	}

	static getBestMatchingPath(pathSuffix: string, allFilePaths: string[]) {
		const pathSuffixParts = pathSuffix
			.split("/")
			.slice()
			.reverse();
		let bestMatchingFilePath = undefined;
		let bestMatchingScore = -1;
		let bestMatchingDepth = 0;

		for (const filePath of allFilePaths) {
			const filePathParts = filePath
				.split("/")
				.slice()
				.reverse();

			let partialMatch = false;
			for (let i = 0; i < pathSuffixParts.length; i++) {
				if (pathSuffixParts[i] === filePathParts[i]) {
					partialMatch = true;
				}
				if (pathSuffixParts[i] !== filePathParts[i] || i === pathSuffixParts.length - 1) {
					if (
						partialMatch &&
						(i > bestMatchingScore ||
							(i === bestMatchingDepth && filePathParts.length < bestMatchingDepth))
					) {
						bestMatchingScore = i;
						bestMatchingFilePath = filePath;
						bestMatchingDepth = filePathParts.length;
					}
					break;
				}
			}
		}
		return bestMatchingFilePath;
	}

	private async getMatchingRepo(repoRemote: string) {
		const { git, repositoryMappings } = SessionContainer.instance();
		const gitRepos = await git.getRepositories();
		let matchingRepo = undefined;

		const normalizedRepoRemote = await repositoryMappings.normalizeUrl({ url: repoRemote });
		if (normalizedRepoRemote && normalizedRepoRemote.normalizedUrl) {
			repoRemote = normalizedRepoRemote.normalizedUrl;
		}
		for (const gitRepo of gitRepos) {
			const remotes = await git.getRepoRemotes(gitRepo.path);
			for (const remote of remotes) {
				let compareRepo = repoRemote.toLowerCase();
				if (!compareRepo.startsWith("ssh://")) {
					compareRepo = `ssh://${compareRepo}`;
				}
				if (!compareRepo.endsWith(".git")) {
					compareRepo += ".git";
				}
				let remoteUri = remote.uri.toString().toLowerCase();
				if (!remoteUri.endsWith(".git")) {
					remoteUri += ".git";
				}
				Logger.log(`comparing remote ${remoteUri} to ${compareRepo}`);
				if (remoteUri === compareRepo) {
					matchingRepo = gitRepo;
					break;
				}

				let normalized = await repositoryMappings.normalizeUrl({ url: remoteUri });
				if (normalized && normalized.normalizedUrl === repoRemote) {
					matchingRepo = gitRepo;
					break;
				}
			}
		}
		return matchingRepo;
	}

	private async resolveStackTraceLine(
		line: CSStackTraceLine,
		sha: string,
		allFilePaths: string[],
		matchingRepo: GitRepository
	): Promise<CSStackTraceLine> {
		const bestMatchingFilePath = NRManager.getBestMatchingPath(line.fileFullPath!, allFilePaths);
		if (!bestMatchingFilePath)
			return { error: `Unable to find matching file for path suffix ${line.fileFullPath!}` };

		const position = await this.getCurrentStackTracePosition(
			sha,
			bestMatchingFilePath,
			line.line!,
			line.column!
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

	private guessStackTraceLanguage(stackTrace: string[]) {
		const langsRepresented: { [key: string]: number } = {};
		let mostRepresented: string = "";
		stackTrace.forEach(line => {
			const extRe = new RegExp(
				`[\/|\\t].+\.(${Object.keys(ExtensionToLanguageMap).join("|")})[^a-zA-Z0-9]`
			);
			const match = line.match(extRe);
			if (match && match[1]) {
				const lang = match[1];
				langsRepresented[lang] = langsRepresented[lang] || 0;
				langsRepresented[lang]++;
				if (langsRepresented[lang] > (langsRepresented[mostRepresented] || 0)) {
					mostRepresented = lang;
				}
			}
		});
		return mostRepresented ? ExtensionToLanguageMap[mostRepresented] : null;
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

		if (!diffToHead) return { error: `Unable to calculate diff from ${sha} to HEAD` };

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

	private async getAllFiles(
		dirPath: string,
		arrayOfFiles?: string[] | undefined
	): Promise<string[]> {
		arrayOfFiles = arrayOfFiles || [];
		const files = await fsPromises.readdir(dirPath);
		for (const file of files) {
			// For demo purposes!!!
			if (file !== "node_modules" && file !== ".git") {
				const filePath = path.join(dirPath, file);
				if ((await fsPromises.stat(filePath)).isDirectory()) {
					arrayOfFiles = await this.getAllFiles(filePath, arrayOfFiles);
				} else {
					arrayOfFiles!.push(filePath);
				}
			}
		}
		return arrayOfFiles;
	}
}
