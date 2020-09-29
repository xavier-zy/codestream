import { ReportingMessageType, ReportMessageRequestType } from "@codestream/protocols/agent";
import { HostApi } from "./webview-api";

export function logError(error: string | Error, extra?: object) {
	console.error(error, extra);

	HostApi.instance.send(ReportMessageRequestType, {
		source: "webview",
		type: ReportingMessageType.Error,
		message: typeof error === "string" ? error : error.message,
		extra
	});
}

export function logWarning(...items: any[]) {
	// console.warn will get removed with webpack, use console.error
	console.error(...items);
}
