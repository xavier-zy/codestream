"use strict";

import { RequestType } from "vscode-languageserver-protocol";

export interface ResolveStackTraceLineRequest {
    rawLine: string;
    repoRemote: string;
    sha: string;
}

export interface ResolveStackTraceLineResponse {
    repoId?: string;
    fileRelativePath?: string;
    fileFullPath?: string;
    line?: number;
    column?: number;
    error?: string;
}

export const ResolveStackTraceLineRequestType = new RequestType<
    ResolveStackTraceLineRequest,
    ResolveStackTraceLineResponse,
    void,
    void
>("codestream/nr/resolveStackTraceLine");