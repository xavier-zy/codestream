import { action } from "../common";
import { SetNewRelicDataActionType } from "./types";
import { NewRelicData, GetNewRelicDataRequestType } from "@codestream/protocols/agent";
import { logError } from "../../logger";
import { HostApi } from "@codestream/webview/webview-api";

export const setNewRelicData = (data: NewRelicData) =>
	action(SetNewRelicDataActionType.SetData, data);

export const runNRQL = (query: string) => async (dispatch, getState) => {
	console.warn("COLIN: IN runNRQL:", query);
	try {
		console.warn("COLIN: SENDING REQUEST....");
		const data = await HostApi.instance.send(GetNewRelicDataRequestType, { query });
		console.warn("COLIN: THE NEW RELIC DATA IS:", data);
		//dispatch(action(SetNewRelicDataActionType.SetData, data));
		dispatch(setNewRelicData(data));
		return data;
	} catch (error) {
		console.warn("CAUGHT:", error);
		logError("failed to get New Relic data");
		return {};
	}
};
