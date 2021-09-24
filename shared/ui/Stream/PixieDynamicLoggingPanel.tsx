import { fetchErrorGroup } from "@codestream/webview/store/codeErrors/actions";
import { pixieDynamicLogging } from "@codestream/webview/store/dynamicLogging/actions";
import { isConnected } from "@codestream/webview/store/providers/reducer";
import React, { useEffect } from "react";
import { Content } from "../src/components/Carousel";
import styled from "styled-components";
import { PanelHeader } from "../src/components/PanelHeader";
import { closePanel } from "./actions";
import { shallowEqual, useDispatch, useSelector } from "react-redux";
import { Dialog } from "../src/components/Dialog";
import { CodeStreamState } from "../store";
import MessageInput from "./MessageInput";
import CancelButton from "./CancelButton";
import Button from "./Button";

const Root = styled.div`
	color: var(--text-color);
	position: relative;
	h2,
	h3 {
		color: var(--text-color-highlight);
	}

	h3 {
		margin: 30px 0 5px 0;
		.icon {
			margin-right: 5px;
			vertical-align: -2px;
		}
	}
`;

export const PixieDynamicLoggingPanel = () => {
	const dispatch = useDispatch();

	return (
		<Dialog maximizable wide noPadding onClose={() => dispatch(closePanel())}>
			<PanelHeader title="Pixie Dynamic Logging">
				<div style={{ height: "5px" }} />
			</PanelHeader>
			<div style={{ padding: "20px" }}>
				<Content>
					<PixieDynamicLogging />
				</Content>
			</div>
		</Dialog>
	);
};

const PixieDynamicLogging = (props: { stack?: string[]; customAttributes?: any }) => {
	const rootRef = React.useRef(null);

	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const { providers = {}, newRelicData, preferences } = state;
		const newRelicIsConnected =
			providers["newrelic*com"] && isConnected(state, { id: "newrelic*com" });
		return {
			newRelicIsConnected,
			currentPixieDynamicLoggingOptions: state.context.currentPixieDynamicLoggingOptions,
			dynamicLogs: state.dynamicLogging?.dynamicLogs
		};
	}, shallowEqual);

	useEffect(() => {
		// TODO
		const El = document.getElementById("xyz")!;
		if (El) {
			El.scrollTo({ top: El.scrollHeight, behavior: "smooth" });
		}
	}, [derivedState.dynamicLogs?.results]);

	return (
		<Root ref={rootRef}>
			<div style={{ padding: "0 20px 0 40px" }}>
				<Button
					id="discard-button"
					className="control-button cancel"
					type="button"
					onClick={() => {
						if (derivedState.currentPixieDynamicLoggingOptions) {
							dispatch(
								pixieDynamicLogging({
									upid: "00000008-0000-1a41-0000-0000072e8792",
									...derivedState.currentPixieDynamicLoggingOptions
								})
							);
						}
					}}
				>
					Capture
				</Button>
				{derivedState.dynamicLogs && (
					<div>
						<div>Status: {derivedState.dynamicLogs?.status}</div>
						<table style={{ borderCollapse: "collapse" }}>
							{derivedState.dynamicLogs &&
								derivedState.dynamicLogs.results?.map((_, index) => {
									return (
										<>
											{index === 0 && (
												<tr
													style={{
														borderTop: "1px solid #666",
														borderBottom: "2px solid #666"
													}}
												>
													{Object.keys(_).map(k => {
														return (
															<td
																style={{
																	width: "25%",
																	padding: "5px 0px 5px 0px",
																	fontWeight: "bold"
																}}
															>
																{k}
															</td>
														);
													})}
												</tr>
											)}
											<tr style={{ borderBottom: "1px solid #666" }}>
												{Object.keys(_).map(k => {
													return (
														<td style={{ width: "25%", padding: "3px 0px 3px 0px" }}>{_[k]}</td>
													);
												})}
											</tr>
										</>
									);
								})}
						</table>
					</div>
				)}
			</div>
		</Root>
	);
};
