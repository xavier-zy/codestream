import { action } from "../common";

import { MigrationActionsType } from "./types";

export const apiMigrating = (cheese: {
	migrating: boolean | undefined;
	requiresRestart: boolean | undefined;
}) => action(MigrationActionsType.Migrating, cheese);
