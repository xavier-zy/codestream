import { ActionType } from "../common";
import * as actions from "./actions";
import { PreferencesActionsType, PreferencesState, FilterQuery } from "./types";
import { merge, mergeWith } from "lodash-es";
import { createSelector } from "reselect";
import { CodeStreamState } from "..";

type PreferencesActions = ActionType<typeof actions>;

const initialState: PreferencesState = {};

const mergeCustom = function(target, source) {
	// don't merge arrays, just copy ... at least i hope that's the right solution
	if (source instanceof Array) {
		return [...source];
	}
};
export function reducePreferences(state = initialState, action: PreferencesActions) {
	switch (action.type) {
		case PreferencesActionsType.Set:
		case PreferencesActionsType.Update: {
			return mergeWith({}, state, action.payload, mergeCustom);
		}
		case "RESET":
			return initialState;
		default:
			return state;
	}
}

export const getSavedSearchFilters = createSelector(
	(state: CodeStreamState) => state.preferences,
	preferences => {
		const savedSearchFilters: FilterQuery[] = [];
		Object.keys(preferences.savedSearchFilters || {}).forEach(key => {
			savedSearchFilters[parseInt(key, 10)] = preferences.savedSearchFilters[key];
		});
		return savedSearchFilters.filter(filter => filter.label.length > 0);
	}
);
