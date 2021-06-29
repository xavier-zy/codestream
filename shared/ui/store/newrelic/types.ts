import { NewRelicData } from "@codestream/protocols/agent";

export interface NewRelicDataState {
	data?: NewRelicData;
}

export enum SetNewRelicDataActionType {
	SetData = "SET_NEW_RELIC_DATA"
}
