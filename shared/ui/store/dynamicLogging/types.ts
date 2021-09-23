import { Index } from "../common";

export enum DynamicLoggingActionsTypes {
	AddDynamicLogging = "ADD_DYNAMICLOGGING"
}

export type DynamicLoggingState = {
	dynamicLogs: {
		status?: string;
		results: any[];
	};
};
