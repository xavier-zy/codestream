import { CSCodeError, CSStackTraceInfo, CSStackTraceLine } from "@codestream/protocols/api";
import { action } from "../common";
import { CodeErrorsActionsTypes } from "./types";
import { HostApi } from "@codestream/webview/webview-api";
import {
	UpdateCodeErrorRequestType,
	DeleteCodeErrorRequestType,
	CreateShareableCodeErrorRequestType,
	GetCodeErrorRequestType,
	FetchCodeErrorsRequestType,
	ResolveStackTraceRequestType,
	ResolveStackTracePositionRequestType,
	UpdateCodeErrorResponse,
	GetNewRelicErrorGroupRequestType,
	GetNewRelicErrorGroupRequest
} from "@codestream/protocols/agent";
import { logError } from "@codestream/webview/logger";
import { addStreams } from "../streams/actions";
import { CodeStreamState } from "..";
import { mapFilter } from "@codestream/webview/utils";
import { addPosts } from "../posts/actions";
import { createPost } from "@codestream/webview/Stream/actions";
import { getTeamMembers } from "../users/reducer";
import { phraseList } from "@codestream/webview/utilities/strings";
import { Position, Range } from "vscode-languageserver-types";
import { highlightRange } from "../../Stream/api-functions";

export const reset = () => action("RESET");

export const _bootstrapCodeErrors = (codeErrors: CSCodeError[]) =>
	action(CodeErrorsActionsTypes.Bootstrap, codeErrors);

export const bootstrapCodeErrors = () => async dispatch => {
	const { codeErrors } = await HostApi.instance.send(FetchCodeErrorsRequestType, {});
	dispatch(_bootstrapCodeErrors(codeErrors));
};

export const addCodeErrors = (codeErrors: CSCodeError[]) =>
	action(CodeErrorsActionsTypes.AddCodeErrors, codeErrors);

export const saveCodeErrors = (codeErrors: CSCodeError[]) =>
	action(CodeErrorsActionsTypes.SaveCodeErrors, codeErrors);

export const updateCodeErrors = (codeErrors: CSCodeError[]) =>
	action(CodeErrorsActionsTypes.UpdateCodeErrors, codeErrors);

export interface NewCodeErrorAttributes {
	objectId?: string;
	objectType?: "ErrorGroup";
	objectInfo?: any;
	title: string;
	description?: string;
	stackTraces: CSStackTraceInfo[];
	assignees?: string[];
	addedUsers?: string[];
	entryPoint?: string;
	replyPost?: {
		text: string;
		mentionedUserIds?: string[];
	};
	providerUrl?: string;
}

export interface CreateCodeErrorError {
	reason: "share" | "create";
	message?: string;
}

export const createCodeError = (attributes: NewCodeErrorAttributes) => async (
	dispatch,
	getState: () => CodeStreamState
) => {
	try {
		const response = await HostApi.instance.send(CreateShareableCodeErrorRequestType, {
			attributes,
			entryPoint: attributes.entryPoint,
			addedUsers: attributes.addedUsers,
			replyPost: attributes.replyPost
		});
		if (response) {
			dispatch(addCodeErrors([response.codeError]));
			dispatch(addStreams([response.stream]));
			dispatch(addPosts([response.post]));
		}
		return response;
	} catch (error) {
		logError("Error creating a code error", { message: error.toString() });
		throw { reason: "create", message: error.toString() } as CreateCodeErrorError;
	}
};

export const _deleteCodeError = (id: string) => action(CodeErrorsActionsTypes.Delete, id);

export const deleteCodeError = (id: string) => async dispatch => {
	try {
		await HostApi.instance.send(DeleteCodeErrorRequestType, {
			id
		});
		dispatch(_deleteCodeError(id));
	} catch (error) {
		logError(`failed to delete code error: ${error}`, { id });
	}
};

/**
 * "Advanced" properties that can come from the client (webview)
 */
interface AdvancedEditableCodeErrorAttributes {
	// array of userIds / tags to add
	$push: { assignees?: string[]; tags?: string[] };
	// array of userIds / tags to remove
	$pull: { assignees?: string[]; tags?: string[] };
}

export type EditableAttributes = Partial<
	Pick<CSCodeError, "title" | "assignees"> & AdvancedEditableCodeErrorAttributes
>;

export const editCodeError = (
	id: string,
	attributes: EditableAttributes,
	replyText?: string
) => async (dispatch, getState: () => CodeStreamState) => {
	let response: UpdateCodeErrorResponse | undefined;
	try {
		response = await HostApi.instance.send(UpdateCodeErrorRequestType, {
			id,
			...attributes
		});
		dispatch(updateCodeErrors([response.codeError]));

		if (
			attributes.$push != null &&
			attributes.$push.assignees != null &&
			attributes.$push.assignees.length
		) {
			// if we have additional ids we're adding via $push, map them here
			const filteredUsers = mapFilter(getTeamMembers(getState()), teamMember => {
				const user = attributes.$push!.assignees!.find(_ => _ === teamMember.id);
				return user ? teamMember : undefined;
			}).filter(Boolean);

			if (filteredUsers.length) {
				dispatch(
					createPost(
						response.codeError.streamId,
						response.codeError.postId,
						`/me added ${phraseList(filteredUsers.map(u => `@${u.username}`))} to this code error`,
						null,
						filteredUsers.map(u => u.id)
					)
				);
			}
		}
	} catch (error) {
		logError(`failed to update code error: ${error}`, { id });
	}
	return response;
};

export const fetchCodeError = (codeErrorId: string) => async dispatch => {
	const response = await HostApi.instance.send(GetCodeErrorRequestType, { codeErrorId });

	if (response.codeError) return dispatch(saveCodeErrors([response.codeError]));
};

export const resolveStackTrace = (
	repo: string,
	sha: string,
	traceId: string,
	stackTrace: string[]
) => {
	return HostApi.instance.send(ResolveStackTraceRequestType, {
		stackTrace,
		repoRemote: repo,
		sha,
		traceId
	});
};

export const jumpToStackLine = (
	stackLine: CSStackTraceLine,
	sha: string,
	repoId: string
) => async dispatch => {
	const currentPosition = await HostApi.instance.send(ResolveStackTracePositionRequestType, {
		sha,
		repoId,
		filePath: stackLine.fileRelativePath!,
		line: stackLine.line!,
		column: stackLine.column!
	});
	if (currentPosition.error) {
		logError(`Unable to jump to stack trace line: ${currentPosition.error}`);
		return;
	}

	const { line, column, path } = currentPosition;
	const start = Position.create(line! - 1, column! - 1);
	const end = Position.create(line! - 1, 10000);
	const range = Range.create(start, end);
	highlightRange({
		uri: `file://${path!}`,
		range,
		highlight: true
	});
};

export const updateCodeError = request => async dispatch => {
	return HostApi.instance.send(UpdateCodeErrorRequestType, request);
};

export const fetchNewRelicErrorGroup = (
	request: GetNewRelicErrorGroupRequest
) => async dispatch => {
	return HostApi.instance.send(GetNewRelicErrorGroupRequestType, request);
};
