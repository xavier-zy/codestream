import { CSCodemark, CodemarkType } from "@codestream/protocols/api";
import { action } from "../common";
import { CodemarksActionsTypes } from "./types";
import { HostApi } from "@codestream/webview/webview-api";
import {
	UpdateCodemarkRequestType,
	DeleteCodemarkRequestType,
	GetRangeScmInfoResponse,
	CrossPostIssueValues,
	CreateShareableCodemarkRequestType,
	CreateThirdPartyPostRequestType,
	CreatePassthroughCodemarkResponse
} from "@codestream/protocols/agent";
import { logError } from "@codestream/webview/logger";
import { addStreams } from "../streams/actions";
import { TextDocumentIdentifier } from "vscode-languageserver-types";
import { getConnectedProviders } from "../providers/reducer";
import { CodeStreamState } from "..";
import { capitalize } from "@codestream/webview/utils";
import { isObject } from "lodash-es";
import { URI } from "vscode-uri";
import { getPullRequestConversationsFromProvider } from "../providerPullRequests/actions";

export const reset = () => action("RESET");

export const addCodemarks = (codemarks: CSCodemark[]) =>
	action(CodemarksActionsTypes.AddCodemarks, codemarks);

export const saveCodemarks = (codemarks: CSCodemark[]) =>
	action(CodemarksActionsTypes.SaveCodemarks, codemarks);

export const updateCodemarks = (codemarks: CSCodemark[]) =>
	action(CodemarksActionsTypes.UpdateCodemarks, codemarks);

export interface BaseNewCodemarkAttributes {
	codeBlocks: GetRangeScmInfoResponse[];
	text: string;
	type: CodemarkType;
	assignees: string[];
	title?: string;
	crossPostIssueValues?: CrossPostIssueValues;
	tags: string[];
	relatedCodemarkIds: string[];
}

export interface SharingNewCodemarkAttributes extends BaseNewCodemarkAttributes {
	accessMemberIds: string[];
	remotes?: string[];
	sharingAttributes?: {
		providerId: string;
		providerTeamId: string;
		channelId: string;
	};
	textDocuments?: TextDocumentIdentifier[];
	entryPoint?: string;
	mentionedUserIds?: string[];
	/** email addresses of users to notify and add to the team */
	addedUsers?: string[];
	/** codemarks can now be replies */
	parentPostId?: string;
	isChangeRequest?: boolean;
	isPseudoCodemark?: boolean;
	/** Signifies if this comment should be part of a code provider's PR review */
	isProviderReview?: boolean;
}

export interface LegacyNewCodemarkAttributes extends BaseNewCodemarkAttributes {
	streamId: string;
}

export type NewCodemarkAttributes = LegacyNewCodemarkAttributes | SharingNewCodemarkAttributes;

export function isLegacyNewCodemarkAttributes(
	object: NewCodemarkAttributes
): object is LegacyNewCodemarkAttributes {
	return (object as any).streamId != undefined;
}

export interface CreateCodemarkError {
	reason: "share" | "create";
}

export function isCreateCodemarkError(object: any): object is CreateCodemarkError {
	return isObject(object) && "reason" in object;
}

export const createCodemark = (attributes: SharingNewCodemarkAttributes) => async (
	dispatch,
	getState: () => CodeStreamState
) => {
	const { accessMemberIds, ...rest } = attributes;

	try {
		const response = await HostApi.instance.send(CreateShareableCodemarkRequestType, {
			attributes: rest,
			memberIds: accessMemberIds,
			textDocuments: attributes.textDocuments,
			entryPoint: attributes.entryPoint,
			mentionedUserIds: attributes.mentionedUserIds,
			addedUsers: attributes.addedUsers,
			parentPostId: attributes.parentPostId,
			isPseudoCodemark: attributes.isPseudoCodemark,
			isProviderReview: attributes.isProviderReview
		});
		if (response) {
			let result;
			let responseAsPassthrough = (response as any) as CreatePassthroughCodemarkResponse;
			if (responseAsPassthrough.isPassThrough) {
				// is pass through -- aka a fake "codemark" that was sent to a code provider
				dispatch(
					getPullRequestConversationsFromProvider(
						responseAsPassthrough.pullRequest.providerId,
						responseAsPassthrough.pullRequest.id
					)
				);
			} else {
				result = dispatch(addCodemarks([response.codemark]));
				dispatch(addStreams([response.stream]));

				if (attributes.sharingAttributes) {
					try {
						await HostApi.instance.send(CreateThirdPartyPostRequestType, {
							providerId: attributes.sharingAttributes.providerId,
							channelId: attributes.sharingAttributes.channelId,
							providerTeamId: attributes.sharingAttributes.providerTeamId,
							text: rest.text,
							codemark: response.codemark,
							remotes: attributes.remotes,
							mentionedUserIds: attributes.mentionedUserIds
						});
						HostApi.instance.track("Shared Codemark", {
							Destination: capitalize(
								getConnectedProviders(getState()).find(
									config => config.id === attributes.sharingAttributes!.providerId
								)!.name
							),
							"Codemark Status": "New"
						});
					} catch (error) {
						logError("Error sharing a codemark", { message: error.toString() });
						throw { reason: "share" } as CreateCodemarkError;
					}
				}
			}
			return result;
		}
	} catch (error) {
		// if this is a sharing error just throw it
		if (isCreateCodemarkError(error)) throw error;

		logError("Error creating a codemark", { message: error.toString() });
		throw { reason: "create" } as CreateCodemarkError;
	}
};

export const _deleteCodemark = (codemarkId: string) =>
	action(CodemarksActionsTypes.Delete, codemarkId);

export const deleteCodemark = (codemarkId: string) => async dispatch => {
	try {
		void (await HostApi.instance.send(DeleteCodemarkRequestType, {
			codemarkId
		}));
		dispatch(_deleteCodemark(codemarkId));
	} catch (error) {
		logError(`failed to delete codemark: ${error}`, { codemarkId });
	}
};

type EditableAttributes = Partial<
	Pick<CSCodemark, "tags" | "text" | "title" | "assignees" | "relatedCodemarkIds">
>;

export const editCodemark = (
	codemarkId: string,
	attributes: EditableAttributes
) => async dispatch => {
	try {
		const response = await HostApi.instance.send(UpdateCodemarkRequestType, {
			codemarkId,
			...attributes
		});
		dispatch(updateCodemarks([response.codemark]));
	} catch (error) {
		logError(`failed to update codemark: ${error}`, { codemarkId });
	}
};

export const canCreateCodemark = (textEditorUri: string | undefined) => {
	// you can create markerless codemarks / codemarks not attached to files
	if (!textEditorUri) return true;
	// currently only support file:// or the "right" side
	// of codemark-diff:// uris
	if (textEditorUri.startsWith("file://")) return true;
	const regex = /codestream-diff:\/\/(\w+)\/(\w+)\/(\w+)\/right\/(.+)/;
	const match = regex.exec(textEditorUri);
	if (match && match.length) return true;

	try {
		const parsed = parseCodeStreamDiffUri(textEditorUri);
		return parsed && parsed.side === "right";
	} catch {}

	return false;
};

export const parseCodeStreamDiffUri = (
	uri?: string
):
	| {
			path: string;
			side: string;
			context?: {
				pullRequest: {
					providerId: string;
					id: string;
				};
			};
	  }
	| undefined => {
	if (!uri) return undefined;

	const m = uri.match(/\/-\d\-\/(.*)\/\-\d\-/);
	if (m && m.length) {
		try {
			return JSON.parse(atob(decodeURIComponent(m[1]))) as any;
		} catch (ex) {
			console.warn(ex);
		}
	}

	return undefined;
};
