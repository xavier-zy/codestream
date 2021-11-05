"use strict";

import { structuredPatch } from "diff";
import path from "path";
import { Container, SessionContainer } from "../container";
import { Logger } from "../logger";
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
	ResolveStackTraceResponse,
	WarningOrError
} from "../protocol/agent.protocol";
import { RepoProjectType } from "../protocol/agent.protocol.scm";
import { CSStackTraceInfo, CSStackTraceLine } from "../protocol/api.protocol.models";
import { CodeStreamSession } from "../session";
import { log } from "../system/decorators/log";
import { lsp, lspHandler } from "../system/decorators/lsp";
import { Strings } from "../system/string";
import { xfs } from "../xfs";

import { DotNetCoreInstrumentation } from "./newRelicInstrumentation/dotNetCoreInstrumentation";
import { JavaInstrumentation } from "./newRelicInstrumentation/javaInstrumentation";
import { NodeJSInstrumentation } from "./newRelicInstrumentation/nodeJSInstrumentation";

import { Parser as csharpParser } from "./stackTraceParsers/csharpStackTraceParser";
import { Parser as goParser } from "./stackTraceParsers/goStackTraceParser";
import { Parser as javascriptParser } from "./stackTraceParsers/javascriptStackTraceParser";
import { Parser as javaParser } from "./stackTraceParsers/javaStackTraceParser";
import { Parser as phpParser } from "./stackTraceParsers/phpStackTraceParser";
import { Parser as pythonParser } from "./stackTraceParsers/pythonStackTraceParser";
import { Parser as rubyParser } from "./stackTraceParsers/rubyStackTraceParser";

import { NewRelicProvider } from "../providers/newrelic";
import { URI } from "vscode-uri";

const ExtensionToLanguageMap: { [key: string]: string } = {
	js: "javascript",
	ts: "javascript",
	rb: "ruby",
	php: "php",
	cs: "c#",
	py: "python",
	kt: "java",
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
	"Your version of the code may not match the environment that triggered the error. Fetch the following commit to better investigate the error.\n${sha}";
const MISSING_SHA_HELP_URL =
	"http://docs.newrelic.com/docs/codestream/start-here/codestream-new-relic/#apm";

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
	async parseStackTrace({
		errorGroupGuid,
		stackTrace
	}: ParseStackTraceRequest): Promise<ParseStackTraceResponse> {
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
		} else {
			try {
				const telemetry = Container.instance().telemetry;
				const parsed = NewRelicProvider.parseId(errorGroupGuid || "");

				telemetry.track({
					eventName: "Error Parsing Trace",
					properties: {
						"Error Group ID": errorGroupGuid!,
						"NR Account ID": parsed?.accountId || 0,
						Language: lang || "Not Detected"
					}
				});
			} catch (ex) {}
			Logger.error(new Error("GuessStackLanguageFailed"), "language guess failed", {
				languageGuess: lang
			});

			let info: ParseStackTraceResponse | undefined = undefined;

			for (lang in StackTraceParsers) {
				try {
					info = StackTraceParsers[lang](whole);
				} catch (error) {}
				if (info && info.lines?.length) {
					break;
				}
			}

			// take the last one
			const response = info || ({} as ParseStackTraceResponse);
			response.warning = {
				message: "Unable to parse language from stack trace"
			};
			return response;
		}
	}

	// parses the passed stack, tries to determine if any of the user's open repos match it, and if so,
	// given the commit hash of the code for which the stack trace was generated, tries to match each line
	// of the stack trace with a line in the user's repo, given that the user may be on a different commit
	@lspHandler(ResolveStackTraceRequestType)
	@log()
	async resolveStackTrace({
		errorGroupGuid,
		stackTrace,
		repoId,
		sha,
		occurrenceId
	}: ResolveStackTraceRequest): Promise<ResolveStackTraceResponse> {
		const { git, repos, repositoryMappings } = SessionContainer.instance();
		const matchingRepo = await git.getRepositoryById(repoId);
		let matchingRepoPath = matchingRepo?.path;
		let firstWarning: WarningOrError | undefined = undefined;

		// NOTE: the warnings should not prevent a stack trace from being displayed
		const setWarning = (warning: WarningOrError) => {
			// only set the warning if we haven't already set it.
			if (!firstWarning) firstWarning = warning;
		};
		if (!matchingRepoPath) {
			const mappedRepo = await repositoryMappings.getByRepoId(repoId);
			if (mappedRepo) {
				matchingRepoPath = mappedRepo;
			} else {
				const repo = await repos.getById(repoId);
				setWarning({
					message: `Repo (${
						repo ? repo.name : repoId
					}) not found in your editor. Open it in order to navigate the stack trace.`
				});
			}
		}

		if (!sha) {
			setWarning({
				message: `No build SHA associated with this error. Your version of the code may not match the environment that triggered the error.`,
				helpUrl: MISSING_SHA_HELP_URL
			});
		} else if (matchingRepoPath) {
			try {
				const { git } = SessionContainer.instance();
				// ensure this sha is actually valid for this repo
				if (!(await git.isValidReference(matchingRepoPath, sha))) {
					// if not found, attempt to fetch all
					Logger.log(`NRManager sha (${sha}) not found. fetching...`);
					await git.fetchAllRemotes(matchingRepoPath);

					if (!(await git.isValidReference(matchingRepoPath, sha))) {
						// if still not there, we can't continue
						Logger.log(`NRManager sha (${sha}) not found after fetch`);
						setWarning({
							message: Strings.interpolate(MISSING_SHA_MESSAGE, { sha: sha }),
							helpUrl: MISSING_SHA_HELP_URL
						});
					}
				}
			} catch (ex) {
				Logger.warn("NRManager issue locating sha", {
					repoId: repoId,
					matchingRepo: matchingRepo,
					sha: sha
				});
				setWarning({
					message: Strings.interpolate(MISSING_SHA_MESSAGE, { sha: sha }),
					helpUrl: MISSING_SHA_HELP_URL
				});
			}
		}

		const parsedStackInfo = await this.parseStackTrace({
			errorGroupGuid,
			stackTrace
		});
		if (parsedStackInfo.parseError) {
			return { error: parsedStackInfo.parseError };
		} else if (sha && !parsedStackInfo.lines.find(line => !line.error)) {
			// if there was an error on all lines (for some reason)
			setWarning({
				message: Strings.interpolate(MISSING_SHA_MESSAGE, { sha: sha }),
				helpUrl: MISSING_SHA_HELP_URL
			});
		}
		if (parsedStackInfo.warning) {
			// if there was a warning parsing, use that first
			firstWarning = parsedStackInfo.warning;
		}
		parsedStackInfo.repoId = repoId;
		parsedStackInfo.sha = sha;
		parsedStackInfo.occurrenceId = occurrenceId;

		const stackTraceText = stackTrace ? stackTrace.join("\n") : "";
		parsedStackInfo.text = stackTraceText;

		const resolvedStackInfo: CSStackTraceInfo = {
			...parsedStackInfo,
			text: stackTraceText,
			lines: []
		};

		if (parsedStackInfo.lines) {
			for (const line of parsedStackInfo.lines) {
				const resolvedLine =
					line.error || !matchingRepoPath
						? { ...line }
						: await this.resolveStackTraceLine(line, sha, matchingRepoPath);
				resolvedStackInfo.lines.push(resolvedLine);
				line.fileRelativePath = resolvedLine.fileRelativePath;
			}
		}

		return {
			warning: firstWarning,
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
		const { git, repositoryMappings } = SessionContainer.instance();

		const matchingRepo = await git.getRepositoryById(repoId);
		let repoPath = matchingRepo?.path;

		if (!repoPath) {
			const mappedRepo = await repositoryMappings.getByRepoId(repoId);
			if (mappedRepo) {
				repoPath = mappedRepo;
			} else {
				return { error: "Unable to find repo " + repoId };
			}
		}

		const fullPath = path.join(repoPath, filePath);
		const normalizedPath = Strings.normalizePath(URI.parse(fullPath).toString(true), {
			addLeadingSlash: true
		}).replace(":", "%3A");

		if (!sha) {
			return {
				path: normalizedPath,
				line: line,
				column: column
			};
		}
		const position = await this.getCurrentStackTracePosition(sha, fullPath, line, column);
		return {
			...position,
			path: normalizedPath
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
		if (!pathSuffix) return undefined;

		// normalize the file paths
		const pathSuffixParts = pathSuffix
			.replace(/\\/g, "/")
			.split("/")
			.slice()
			.reverse();
		let bestMatchingFilePath = undefined;
		let bestMatchingScore = -1;
		let bestMatchingDepth = 0;

		for (const filePath of allFilePaths) {
			// normalize the file paths
			const filePathParts = filePath
				.replace(/\\/g, "/")
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

	private async resolveStackTraceLine(
		line: CSStackTraceLine,
		sha: string,
		matchingRepoPath: string
	): Promise<CSStackTraceLine> {
		const fileFullPath = line.fileFullPath || "";
		if (!fileFullPath) {
			return { error: `Unable to find file path for line` };
		}
		const fileSearchResponse = await SessionContainer.instance().session.onFileSearch(
			matchingRepoPath,
			fileFullPath
		);
		const bestMatchingFilePath = NRManager.getBestMatchingPath(
			fileFullPath,
			fileSearchResponse.files
		);
		if (!bestMatchingFilePath) {
			return { error: `Unable to find matching file for path ${fileFullPath}` };
		}

		if (!sha) {
			return {
				warning: "Missing sha",
				fileFullPath: bestMatchingFilePath,
				fileRelativePath: path.relative(matchingRepoPath, bestMatchingFilePath),
				line: line.line || 0,
				column: line.column || 0
			};
		}

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
			fileRelativePath: path.relative(matchingRepoPath, bestMatchingFilePath),
			line: position.line,
			column: position.column
		};
	}

	private guessStackTraceLanguage(stackTrace: string[]) {
		const langsRepresented: { [key: string]: number } = {};
		let mostRepresented = "";
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
		if (!currentBufferText) {
			return { error: `Unable to read current buffer contents of ${filePath}` };
		}

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
}
