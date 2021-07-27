import { ActionType } from "../common";
import * as actions from "./actions";
import { SetNewRelicDataActionType, NewRelicDataState } from "./types";

type NewRelicDataActions = ActionType<typeof actions>;

const initialState: NewRelicDataState = {};

export function reduceNewRelicData(state = initialState, action: NewRelicDataActions) {
	console.warn("COLIN: REDUCING NEW RELIC DATA:", action);
	switch (action.type) {
		case SetNewRelicDataActionType.SetData:
			console.warn("GOT PAYLOAD:", action.payload);
			return { ...state, data: action.payload.data };
		default:
			return state;
	}
}
