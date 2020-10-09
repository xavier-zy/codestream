import { HostApi } from "../webview-api";
import { GetDocumentFromMarkerRequestType } from "@codestream/protocols/agent";
import { logError } from "../logger";
import {
	EditorHighlightRangeRequestType,
	EditorHighlightRangeRequest
} from "../ipc/host.protocol.editor";

export async function getDocumentFromMarker(markerId: string) {
	try {
		const response = await HostApi.instance.send(GetDocumentFromMarkerRequestType, {
			markerId: markerId
		});

		return response || undefined;
	} catch (error) {
		logError("Error making request 'GetDocumentFromMarkerRequestType'", {
			message: error.toString()
		});
		return undefined;
	}
}

export async function highlightRange(request: EditorHighlightRangeRequest) {
	try {
		const { success } = await HostApi.instance.send(EditorHighlightRangeRequestType, request);
		return success;
	} catch (error) {
		logError("Error making request 'EditorHighlightRangeRequestType'", {
			message: error.toString()
		});
		return false;
	}
}
