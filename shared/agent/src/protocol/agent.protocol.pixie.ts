"use strict";

import { RequestType } from "vscode-languageserver-protocol";

export interface PixieDynamicLoggingFunctionParameter {
    name: string;
    type: string;
}

export interface PixieDynamicLoggingRequest {
    functionName: string;
    functionParameters: PixieDynamicLoggingFunctionParameter[];
    functionReceiver?: string;
}

export interface PixieDynamicLoggingReponse {
    recentArgs: number[];
}

export const PixieDynamicLoggingRequestType = new RequestType<PixieDynamicLoggingRequest, PixieDynamicLoggingReponse, void, void>(
    "codestream/pixie/test"
);
