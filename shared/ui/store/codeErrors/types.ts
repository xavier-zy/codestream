import { CSCodeError } from "@codestream/protocols/api";
import { Index } from "../common";

export enum CodeErrorsActionsTypes {
	AddCodeErrors = "ADD_CODEERRORS",
	SaveCodeErrors = "@codeErrors/SaveCodeErrors",
	UpdateCodeErrors = "@codeErrors/UpdateCodeErrors",
	Delete = "@codeErrors/Delete",
	Bootstrap = "@codeErrors/Bootstrap",
	HandleDirectives = "@codeErrors/HandleDirectives",
	AddProviderError = "@codeErrors/AddError",
	ClearProviderError = "@codeErrors/ClearError",
	SetErrorGroup = "@codeError/SetErrorGroup"
}

export type CodeErrorsState = {
	bootstrapped: boolean;
	codeErrors: Index<CSCodeError>;
	errorGroups: Index<{
		id: string;
		error?: string;
		errorGroup: {
			id: string;
			// TODO fix me get the real object type
			assignee?: any;
			state?: any;
			repo?: string;
		};
	}>;
};
