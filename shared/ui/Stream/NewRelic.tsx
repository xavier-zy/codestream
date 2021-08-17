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
import { IntegrationButtons, Provider } from "./IntegrationsPanel";
import { configureAndConnectProvider } from "../store/providers/actions";
import Icon from "./Icon";
import Tooltip from "./Tooltip";
import { setUserPreference } from "./actions";
import { Linkish } from "./CrossPostIssueControls/IssueDropdown";

interface Props {
	paneState: PaneState;
}

export const NewRelic = React.memo((props: Props) => {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const { providers = {}, newRelicData } = state;
		const newRelicIsConnected =
			providers["newrelic*com"] && isConnected(state, { id: "newrelic*com" });
		const data = (newRelicData && newRelicData.data) || undefined;
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
			<PaneHeader title="Observability" id={WebviewPanels.NewRelic}>
				&nbsp;
			</PaneHeader>
			{props.paneState !== PaneState.Collapsed && (
				<PaneBody>
					<div style={{ padding: "0 10px 0 20px" }}></div>
					{derivedState.newRelicIsConnected ? (
						<div style={{ padding: "0 20px" }}>
							Enter your NRQL query:&nbsp;&nbsp;
							<TextInput name="query" value={query} onChange={setQuery} />
							&nbsp;
							<Button size="compact" onClick={onSubmit} isLoading={loading}>
								Go
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
							<div>
								{derivedState.newRelicData &&
									JSON.stringify(derivedState.newRelicData, undefined, 5)}
							</div>
						</div>
					) : (
						<>
							<div className="filters" style={{ padding: "0 20px 10px 20px" }}>
								<span>
									Connect to New Relic to instrument your app, see errors, and debug issues.{" "}
									<Tooltip title="Connect later on the Integrations page" placement="top">
										<Linkish
											onClick={() =>
												dispatch(setUserPreference(["skipConnectObservabilityProviders"], true))
											}
										>
											Skip this step.
										</Linkish>
									</Tooltip>
								</span>
							</div>

							<IntegrationButtons noBorder style={{ marginBottom: "20px" }}>
								<Provider
									key="newrelic"
									onClick={() =>
										dispatch(configureAndConnectProvider("newrelic*com", "Observability Section"))
									}
								>
									<Icon name="newrelic" />
									New Relic
								</Provider>
							</IntegrationButtons>
						</>
					)}
				</PaneBody>
			)}
		</>
	);
});
