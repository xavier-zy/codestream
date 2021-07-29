import { action } from "../common";
import { SetNewRelicDataActionType } from "./types";
import { NewRelicData, GetNewRelicDataRequestType } from "@codestream/protocols/agent";
import { logError } from "../../logger";
import { HostApi } from "@codestream/webview/webview-api";

export const setNewRelicData = (data: NewRelicData) =>
	action(SetNewRelicDataActionType.SetData, data);

export const runNRQL = (query: string) => async (dispatch, getState) => {
	try {
		const data = await HostApi.instance.send(GetNewRelicDataRequestType, { query });
		dispatch(setNewRelicData(data));
		return data;
	} catch (error) {
		logError("failed to get New Relic data");
		return {};
	}
};
