"use strict";

export class AgentError extends Error {
	info: any;
	innerError: Error | undefined;

	constructor(message: string, info: any = {}) {
		super(message);
		this.info = info;
	}

	static wrap(ex: Error, message: string, info: any = {}) {
		const wrapped = new AgentError(message, info);
		wrapped.innerError = ex;
		return wrapped;
	}
}

export class ServerError extends AgentError {
	statusCode: number | undefined;

	constructor(message: string, info: any = {}, statusCode?: number) {
		super(message, info);
		this.statusCode = statusCode;
	}
}

export enum ReportSuppressedMessages {
	AccessTokenInvalid = "Access token invalid"
}

export class InternalError extends AgentError {

	public suppressReporting: boolean;

	constructor(message: string, info: any = {}) {
		super(message, info);
		this.name = "InternalError";
		this.suppressReporting = true;
	}
}
