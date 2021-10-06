import { ActionType } from "../common";
import { MigrationActionsType, MigrationState } from "./types";
import * as actions from "./actions";

const initialState: MigrationState = {
	migrating: undefined,
	requiresRestart: undefined
};

type MigrationsActions = ActionType<typeof actions>;

export function reduceApiMigration(state = initialState, action: MigrationsActions) {
	switch (action.type) {
		case MigrationActionsType.Migrating:
			return {
				...state,
				migrating: action.payload.migrating,
				requiresRestart: action.payload.requiresRestart
			};

		default:
			return state;
	}
}
