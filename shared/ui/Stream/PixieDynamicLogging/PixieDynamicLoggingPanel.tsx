import { NewRelicAccount, PixieCluster, PixiePod } from "@codestream/protocols/agent";
import { pixieDynamicLogging } from "@codestream/webview/store/dynamicLogging/actions";
import { isConnected } from "@codestream/webview/store/providers/reducer";
import { Accounts } from "@codestream/webview/Stream/PixieDynamicLogging/Accounts";
import { Clusters } from "@codestream/webview/Stream/PixieDynamicLogging/Clusters";
import { Namespaces } from "@codestream/webview/Stream/PixieDynamicLogging/Namespaces";
import { Pods } from "@codestream/webview/Stream/PixieDynamicLogging/Pods";
import React, { useEffect } from "react";
import { shallowEqual, useDispatch, useSelector } from "react-redux";
import styled from "styled-components";
import { Content } from "../../src/components/Carousel";
import { Dialog } from "../../src/components/Dialog";
import { PanelHeader } from "../../src/components/PanelHeader";
import { CodeStreamState } from "../../store";
import { closePanel } from "../actions";
import Button from "../Button";

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
	const [account, setAccount] = React.useState<NewRelicAccount | undefined>();
	const [cluster, setCluster] = React.useState<PixieCluster | undefined>();
	const [namespace, setNamespace] = React.useState<string | undefined>();
	const [pod, setPod] = React.useState<PixiePod | undefined>();

	return (
		<Dialog maximizable wide noPadding onClose={() => dispatch(closePanel())}>
			<PanelHeader title="Pixie Dynamic Logging">
				<div style={{ height: "5px" }} />
			</PanelHeader>
			<div style={{ padding: "20px" }}>
				<Content>
					<Accounts onSelect={setAccount} value={account} />
					{account && (
						<>
							<br />
							<Clusters account={account} onSelect={setCluster} value={cluster} />
						</>
					)}
					{cluster && (
						<>
							<br />
							<Namespaces
								account={account}
								cluster={cluster}
								onSelect={setNamespace}
								value={namespace}
							/>
						</>
					)}
					{namespace && (
						<>
							<br />
							<Pods
								account={account}
								cluster={cluster}
								namespace={namespace}
								onSelect={setPod}
								value={pod}
							/>
						</>
					)}
					<br />
					<PixieDynamicLogging account={account} cluster={cluster} pod={pod} />
				</Content>
			</div>
		</Dialog>
	);
};

interface IPixieDynamicLoggingContext {
	account?: NewRelicAccount;
}

const PixieDynamicLogging = props => {
	const rootRef = React.useRef(null);

	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const { providers = {}, preferences } = state;
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
			<div>
				<Button
					id="discard-button"
					className="control-button cancel"
					type="button"
					onClick={() => {
						if (derivedState.currentPixieDynamicLoggingOptions) {
							dispatch(
								pixieDynamicLogging({
									accountId: props.account.id,
									clusterId: props.cluster.clusterId,
									upid: props.pod.upid,
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
