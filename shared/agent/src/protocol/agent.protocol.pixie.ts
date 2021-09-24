"use strict";

import { NotificationType, RequestType } from "vscode-languageserver-protocol";

export interface PixieDynamicLoggingFunctionParameter {
	name: string;
}

export interface PixieDynamicLoggingRequest {
	functionName: string;
	functionParameters: PixieDynamicLoggingFunctionParameter[];
	functionReceiver?: string;
	packageName: string;
	upid: string;
	limitRows?: number;
	limitSeconds?: number;
}

export interface PixieDynamicLoggingReponse {
	id: string;
}

export const PixieDynamicLoggingRequestType = new RequestType<
	PixieDynamicLoggingRequest,
	PixieDynamicLoggingReponse,
	void,
	void
>("codestream/pixie/dynamicLogging");

export interface PixieDynamicLoggingCancelRequest {
	id: string;
}

export const PixieDynamicLoggingCancelRequest = new RequestType<
	PixieDynamicLoggingCancelRequest,
	void,
	void,
	void
>("codestream/pixie/dynamicLoggingCancel");

export interface PixieDynamicLoggingEventNotification {
	id: string;
	metaData?: string[];
	data?: { [key: string]: string }[];
	error?: string;
	status: string;
	done: boolean;
}

export const PixieDynamicLoggingResultNotification = new NotificationType<
	PixieDynamicLoggingEventNotification,
	void
>("codestream/pixie/dynamicLoggingEvent");
