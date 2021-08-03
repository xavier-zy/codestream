"use strict";

import { RequestType } from "vscode-languageserver-protocol";
import { CSStackTraceInfo } from "./api.protocol.models";

export interface ParseStackTraceRequest {
	stackTrace: string | string[];
}

export interface ParseStackTraceResponse extends CSStackTraceInfo {
	parseError?: string;
}

export const ParseStackTraceRequestType = new RequestType<
	ParseStackTraceRequest,
	ParseStackTraceResponse,
	void,
	void
>("codestream/nr/parseStackTrace");

export interface ResolveStackTraceRequest {
	stackTrace: string[];
	repoRemote: string;
	sha: string;
}

export interface ResolveStackTraceResponse {
	parsedStackInfo?: CSStackTraceInfo; // this is parsed info relative to the given sha, to be stored
	resolvedStackInfo?: CSStackTraceInfo; // this is relative to the user's current sha, ephemeral
	error?: string;
}

export const ResolveStackTraceRequestType = new RequestType<
	ResolveStackTraceRequest,
	ResolveStackTraceResponse,
	void,
	void
>("codestream/nr/resolveStackTrace");

export interface ResolveStackTracePositionRequest {
	sha: string;
	repoId: string;
	filePath: string;
	line: number;
	column: number;
}

export interface ResolveStackTracePositionResponse {
	line?: number;
	column?: number;
	path?: string;
	error?: string;
}

export const ResolveStackTracePositionRequestType = new RequestType<
	ResolveStackTracePositionRequest,
	ResolveStackTracePositionResponse,
	void,
	void
>("codestream/nr/resolveStackTracePosition");

export interface FindCandidateMainFilesRequest {
	type: string;
	path: string;
}

export interface FindCandidateMainFilesResponse {
	error?: string;
	files: string[];
}

export const FindCandidateMainFilesRequestType = new RequestType<
	FindCandidateMainFilesRequest,
	FindCandidateMainFilesResponse,
	void,
	void
>("codestream/nr/findCandidateMainFiles");

export interface InstallNewRelicRequest {
	type: string;
	cwd: string;
}

export interface InstallNewRelicResponse {
	error?: string;
}

export const InstallNewRelicRequestType = new RequestType<
	InstallNewRelicRequest,
	InstallNewRelicResponse,
	void,
	void
>("codestream/nr/installNewRelic");

export interface CreateNewRelicConfigFileRequest {
	type: string;
	filePath: string;
	licenseKey: string;
	appName: string;
}

export interface CreateNewRelicConfigFileResponse {
	error?: string;
}

export const CreateNewRelicConfigFileRequestType = new RequestType<
	CreateNewRelicConfigFileRequest,
	CreateNewRelicConfigFileResponse,
	void,
	void
>("codestream/nr/createNewRelicConfigFile");

export interface AddNewRelicIncludeRequest {
	type: string;
	file: string;
	dir: string;
}

export interface AddNewRelicIncludeResponse {
	error?: string;
}

export const AddNewRelicIncludeRequestType = new RequestType<
	AddNewRelicIncludeRequest,
	AddNewRelicIncludeResponse,
	void,
	void
>("codestream/nr/addNewRelicInclude");
