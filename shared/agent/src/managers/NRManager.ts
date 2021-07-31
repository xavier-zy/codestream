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
import { spawnSync } from "child_process";
import { Logger } from "../logger";
import { Parser as javascriptParser } from "./stackTraceParsers/javascriptStackTraceParser";
import { Parser as rubyParser } from "./stackTraceParsers/rubyStackTraceParser";
import { Parser as phpParser } from "./stackTraceParsers/phpStackTraceParser";
import { Parser as pythonParser } from "./stackTraceParsers/pythonStackTraceParser";
import { Parser as csharpParser } from "./stackTraceParsers/csharpStackTraceParser";
import { Parser as javaParser } from "./stackTraceParsers/javaStackTraceParser";

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
	java: "java"
};

type Parser = (stack: string) => CSStackTraceInfo;

const StackTraceParsers: { [key: string]: Parser } = {
	javascript: javascriptParser,
	ruby: rubyParser,
	php: phpParser,
	"c#": csharpParser,
	python: pythonParser,
	java: javaParser
};

const MISSING_SHA_MESSAGE =
	"Your version of the code doesn't match production. Fetch the following commit to better investigate the error.\n${sha}";

@lsp
export class NRManager {
	constructor(readonly session: CodeStreamSession) {}

	// returns info gleaned from parsing a stack trace
	@log()
	@lspHandler(ParseStackTraceRequestType)
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
						...response,
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
				...response,
				error: Strings.interpolate(MISSING_SHA_MESSAGE, { sha: sha })
			};
		}

		response.repoId = matchingRepo.id;
		response.sha = sha;

		const allFilePaths = this.getAllFiles(matchingRepo.path);

		const stackTraceInfo = await this.parseStackTrace({ stackTrace });
		if (stackTraceInfo.error) {
			return stackTraceInfo;
		} else if (!stackTraceInfo.lines.find(line => !line.error)) {
			// if there was an error on all lines (for some reason)
			return {
				...response,
				error: Strings.interpolate(MISSING_SHA_MESSAGE, { sha: sha })
			};
		}

		for (const line of stackTraceInfo.lines) {
			await this.resolveStackTraceLine(line, sha, allFilePaths, matchingRepo);
		}

		return {
			...response,
			...stackTraceInfo
		};
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
				if (!pathSuffixParts[i] || pathSuffixParts[i] !== filePathParts[i]) {
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
		line: CSStackTraceLine,
		sha: string,
		allFilePaths: string[],
		matchingRepo: GitRepository
	): Promise<CSStackTraceLine> {
		const bestMatchingFilePath = this.getBestMatchingPath(line.fileFullPath!, allFilePaths);
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
				`\/.+\.(${Object.keys(ExtensionToLanguageMap).join("|")})[^a-zA-Z0-9]`
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

	private getAllFiles(dirPath: string, arrayOfFiles?: string[] | undefined): string[] {
		arrayOfFiles = arrayOfFiles || [];
		const files = fs.readdirSync(dirPath);
		for (const file of files) {
			// For demo purposes!!!
			if (file !== "node_modules" && file !== ".git") {
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
