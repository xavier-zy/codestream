"use strict";

import { RequestType } from "vscode-languageserver-protocol";
import { CSStackTraceInfo } from "./api.protocol.models";

export interface ResolveStackTraceRequest {
	stackTrace: string[];
	repoRemote: string;
	sha: string;
}

export interface ResolveStackTraceResponse extends CSStackTraceInfo {}

export const ResolveStackTraceRequestType = new RequestType<
	ResolveStackTraceRequest,
	ResolveStackTraceResponse,
	void,
	void
>("codestream/nr/resolveStackTrace");

export interface ResolveStackTracePositionRequest {
	sha: string;
	filePath: string;
	line: number;
	column: number;
}

export interface ResolveStackTracePositionResponse {
	line?: number;
	column?: number;
	error?: string;
}

export const ResolveStackTracePositionRequestType = new RequestType<
	ResolveStackTracePositionRequest,
	ResolveStackTracePositionResponse,
	void,
	void
>("codestream/nr/resolveStackTracePosition");
