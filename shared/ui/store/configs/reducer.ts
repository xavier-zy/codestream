import { ActionType } from "../common";
import * as actions from "./actions";
import { ConfigsActionsType, ConfigsState } from "./types";
import * as url from "url";

type ConfigsActions = ActionType<typeof actions>;

const initialState: ConfigsState = {
	showHeadshots: true,
	debug: false,
	requestFeedbackOnCommit: true,
	serverUrl: ""
};

export function reduceConfigs(state = initialState, { type, payload }: ConfigsActions) {
	switch (type) {
		case ConfigsActionsType.Update:
			return { ...state, ...payload };
		default:
			return { ...initialState, ...state };
	}
}

export const supportsIntegrations = (configs: Partial<ConfigsState>) => {
	if (!configs.serverUrl || url.parse(configs.serverUrl).protocol === "https:") {
		return true;
	} else {
		return false;
	}
};

export const isOnPrem = (configs: Partial<ConfigsState>) => {
	const { serverUrl } = configs;
	const match = serverUrl!.match(/^https?:\/\/(.+)\.codestream\.(us|com)/);
	return !match || match[1] === "oppr" || match[1] === "opbeta";
};
