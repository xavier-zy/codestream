import { action } from "../common";
import { DynamicLoggingActionsTypes } from "./types";

export const reset = () => action("RESET");

export const addDynamicLogging = (whatever: { status?: string; results: any[] }) =>
	action(DynamicLoggingActionsTypes.AddDynamicLogging, whatever);
