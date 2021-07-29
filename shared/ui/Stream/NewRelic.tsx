import React, { useState } from "react";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { PaneHeader, PaneBody, PaneState } from "../src/components/Pane";
import { WebviewPanels } from "../ipc/webview.protocol.common";
import { CodeStreamState } from "../store";
import { isConnected } from "../store/providers/reducer";
import { runNRQL, setNewRelicData } from "../store/newrelic/actions";
import { TextInput } from "../Authentication/TextInput";
import { Button } from "../src/components/Button";
import { FormattedMessage } from "react-intl";

interface Props {
	paneState: PaneState;
}

export const NewRelic = React.memo((props: Props) => {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const { providers = {}, newRelicData } = state;
		const newRelicIsConnected =
			providers["newrelic*com"] && isConnected(state, { id: "newrelic*com" });
		const data = (newRelicData && newRelicData.data) || {};
		return { newRelicIsConnected, newRelicData: data };
	}, shallowEqual);

	const [loading, setLoading] = useState(false);
	const [query, setQuery] = useState("");
	const [unexpectedError, setUnexpectedError] = useState(false);

	const onSubmit = async (event: React.SyntheticEvent) => {
		setUnexpectedError(false);
		event.preventDefault();

		setLoading(true);
		try {
			dispatch(runNRQL(query));
		} catch (error) {
			setUnexpectedError(true);
		}
		// @ts-ignore
		setLoading(false);
	};

	return (
		<>
			<PaneHeader title={<>New Relic</>} id={WebviewPanels.NewRelic}>
				&nbsp;
			</PaneHeader>
			{props.paneState !== PaneState.Collapsed && (
				<PaneBody>
					<div style={{ padding: "0 10px 0 20px" }}></div>
					{derivedState.newRelicIsConnected && (
						<div>
							Enter your NRQL query:
							<TextInput name="query" value={query} onChange={setQuery} />
							<Button onClick={onSubmit} isLoading={loading}>
								Submit
							</Button>
							{unexpectedError && (
								<div className="error-message form-error">
									<FormattedMessage
										id="error.unexpected"
										defaultMessage="Something went wrong! Please try again, or "
									/>
									.
								</div>
							)}
							<div>{JSON.stringify(derivedState.newRelicData, undefined, 5)}</div>
						</div>
					)}
				</PaneBody>
			)}
		</>
	);
});
