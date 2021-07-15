import { createSelector } from "reselect";
import { toMapBy } from "../../utils";
import { ActionType, Index } from "../common";
import * as actions from "./actions";
import { CodeErrorsActionsTypes, CodeErrorsState } from "./types";
import { CSCodeError } from "@codestream/protocols/api";
import { CodeStreamState } from "..";

type CodeErrorsActions = ActionType<typeof actions>;

const initialState: CodeErrorsState = { bootstrapped: false, codeErrors: {} };

export function reduceCodeErrors(state = initialState, action: CodeErrorsActions): CodeErrorsState {
	switch (action.type) {
		case CodeErrorsActionsTypes.Bootstrap:
			return {
				bootstrapped: true,
				codeErrors: { ...state.codeErrors, ...toMapBy("id", action.payload) }
			};
		case CodeErrorsActionsTypes.AddCodeErrors:
		case CodeErrorsActionsTypes.UpdateCodeErrors:
		case CodeErrorsActionsTypes.SaveCodeErrors: {
			return {
				bootstrapped: state.bootstrapped,
				codeErrors: { ...state.codeErrors, ...toMapBy("id", action.payload) }
			};
		}
		case CodeErrorsActionsTypes.Delete: {
			const nextCodeErrors = { ...state.codeErrors };
			delete nextCodeErrors[action.payload];
			return { bootstrapped: state.bootstrapped, codeErrors: nextCodeErrors };
		}
		case "RESET":
			return initialState;
		default:
			return state;
	}
}

export function getCodeError(state: CodeErrorsState, id: string): CSCodeError | undefined {
	return state.codeErrors[id];
}

export function getByStatus(state: CodeStreamState, status?: string): CSCodeError[] {
	if (!status) return getAllCodeErrors(state);

	return getAllCodeErrors(state).filter(codeError => codeError.status === status);
}

const getCodeErrors = (state: CodeStreamState) => state.codeErrors.codeErrors;

export const getByStatusAndUser = createSelector(
	getCodeErrors,
	(a, status) => status,
	(a, b, userId) => userId,
	(codeErrors, status, userId) => {
		return Object.values(codeErrors).filter(
			codeError =>
				!codeError.deactivated &&
				codeError.status === status &&
				(codeError.creatorId === userId ||
					(codeError.assignees || []).includes(userId) ||
					(codeError.codeAuthorIds || []).includes(userId) ||
					(codeError.followerIds || []).includes(userId))
		);
	}
);

export const getAllCodeErrors = createSelector(getCodeErrors, (codeErrors: Index<CSCodeError>) =>
	Object.values(codeErrors).filter(codeError => !codeError.deactivated)
);

export const getAllCodeErrorLinks = createSelector(
	getCodeErrors,
	(codeErrors: Index<CSCodeError>) =>
		Object.values(codeErrors)
			.filter(codeError => !codeError.deactivated && codeError.permalink)
			.map(_ => {
				return {
					id: _.id,
					permalink: _.permalink
				};
			})
);

export const teamHasCodeErrors = createSelector(getCodeErrors, (codeErrors: Index<CSCodeError>) => {
	return Object.keys(codeErrors).length > 0;
});

export const teamCodeErrorCount = createSelector(
	getCodeErrors,
	(codeErrors: Index<CSCodeError>) => {
		return Object.keys(codeErrors).length;
	}
);

export const getCodeErrorsUnread = createSelector(
	getCodeErrors,
	(codeErrors: Index<CSCodeError>) => {
		let ret = {};
	}
);
