import { CSCodeError } from "@codestream/protocols/api";
import { Index } from "../common";

export enum CodeErrorsActionsTypes {
	AddCodeErrors = "ADD_CODEERRORS",
	SaveCodeErrors = "@codeErrors/SaveCodeErrors",
	UpdateCodeErrors = "@codeErrors/UpdateCodeErrors",
	Delete = "@codeErrors/Delete",
	Bootstrap = "@codeErrors/Bootstrap"
}

export type CodeErrorsState = {
	bootstrapped: boolean;
	codeErrors: Index<CSCodeError>;
};
