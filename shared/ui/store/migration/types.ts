export interface MigrationState {
	migrating: boolean | undefined;
	requiresRestart: boolean | undefined;
}

export enum MigrationActionsType {
	Migrating = "Migrating"
}
