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
    packageName: string;
    upid: string;
}

export interface PixieDynamicLoggingReponse {
    data: { [key: string]: string }[];
}

export const PixieDynamicLoggingRequestType = new RequestType<PixieDynamicLoggingRequest, PixieDynamicLoggingReponse, void, void>(
    "codestream/pixie/test"
);
