import React from "react";
import { useEffect } from "react";
import styled from "styled-components";
import { useDispatch, useSelector, shallowEqual } from "react-redux";
import { closeAllPanels, setCurrentCodeError } from "@codestream/webview/store/context/actions";
import { useDidMount } from "@codestream/webview/utilities/hooks";
import { fetchCodeError } from "@codestream/webview/store/codeErrors/actions";
import { CodeStreamState } from "../store";
import { getCodeError } from "../store/codeErrors/reducer";
import { MinimumWidthCard, Meta, BigTitle, Header } from "./Codemark/BaseCodemark";
import { closePanel, markItemRead } from "./actions";
import { Dispatch } from "../store/common";
import { CodeError, BaseCodeErrorHeader, ExpandedAuthor, Description } from "./CodeError";
import ScrollBox from "./ScrollBox";
import KeystrokeDispatcher from "../utilities/keystroke-dispatcher";
import { CodeErrorForm } from "./CodeErrorForm";
import { isFeatureEnabled } from "../store/apiVersioning/reducer";
import { getSidebarLocation } from "../store/editorContext/reducer";
import Icon from "./Icon";
import { isConnected } from "../store/providers/reducer";
import { ConfigureNewRelic } from "./ConfigureNewRelic";
import Dismissable from "./Dismissable";

const NavHeader = styled.div`
	// flex-grow: 0;
	// flex-shrink: 0;
	// display: flex;
	// align-items: flex-start;
	padding: 15px 10px 10px 15px;
	// justify-content: center;
	width: 100%;
	${Header} {
		margin-bottom: 0;
	}
	${BigTitle} {
		font-size: 16px;
	}
`;

const Root = styled.div`
	max-height: 100%;
	display: flex;
	flex-direction: column;
	&.tour-on {
		${Meta},
		${Description},
		${ExpandedAuthor},
		${Header},
		.replies-to-review {
			opacity: 0.25;
		}
	}
	#changed-files {
		transition: opacity 0.2s;
	}
	.pulse #changed-files {
		opacity: 1;
		box-shadow: 0 5px 10px rgba(0, 0, 0, 0.2);
		background: var(--app-background-color-hover);
	}

	.scroll-container {
		flex-grow: 1;
		width: 100%;
		overflow: auto;
		zindex: 1;
	}

	// prefer icons to text
	@media only screen and (max-width: 430px) {
		.btn-group {
			button {
				.narrow-icon {
					display: block;
					margin: 0;
				}
				padding: 3px 5px;
				line-height: 1em;
			}
		}
		.wide-text {
			display: none;
		}
	}

`;

export const CodeErrorErrorBox = styled.div`
	margin: 10px 10px 20px 0;
	border: 1px solid rgba(249, 197, 19, 0.6);
	background: rgba(255, 223, 0, 0.1);
	border-radius: 5px;
	padding: 10px;
	display: flex;
	align-items: center;
	.icon.alert {
		display: inline-block;
		transform: scale(1.5);
		margin: 0 10px;
	}
	.message {
		margin-left: 10px;
	}
`;

export const StyledCodeError = styled.div``;

export type Props = React.PropsWithChildren<{ codeErrorId: string; composeOpen: boolean }>;

export function CodeErrorNav(props: Props) {
	const dispatch = useDispatch<Dispatch | any>();
	const derivedState = useSelector((state: CodeStreamState) => {
		const codeError = getCodeError(state.codeErrors, props.codeErrorId);
		const currentUserId = state.session.userId || "";

		return {
			currentCodeErrorId: state.context.currentCodeErrorId,
			currentCodeErrorData: state.context.currentCodeErrorData,
			codeError,
			currentCodemarkId: state.context.currentCodemarkId,
			isMine: currentUserId === (codeError ? codeError.creatorId : ""),
			sidebarLocation: getSidebarLocation(state),
			isConnectedToNewRelic: isConnected(state, { id: "newrelic*com" })
		};
	}, shallowEqual);

	const [isEditing, setIsEditing] = React.useState(false);
	const [notFound, setNotFound] = React.useState(false);
	const [lastUpdated, setLastUpdated] = React.useState(new Date());
	const [isLoading, setIsLoading] = React.useState(false);
	const [error, setError] = React.useState<{ title: string; description: string } | undefined>(
		undefined
	);

	const { codeError } = derivedState;

	const exit = async () => {
		// clear out the current code error (set to blank) in the webview
		await dispatch(setCurrentCodeError());
		dispatch(closePanel());
	};

	const unreadEnabled = useSelector((state: CodeStreamState) =>
		isFeatureEnabled(state, "readItem")
	);

	const markRead = () => {
		// @ts-ignore
		if (codeError && unreadEnabled) dispatch(markItemRead(codeError.id, codeError.numReplies || 0));
	};

	useDidMount(() => {
		let isValid = true;
		setIsLoading(true);
		if (codeError == null) {
			dispatch(fetchCodeError(props.codeErrorId)).then(result => {
				setIsLoading(false);
				if (!isValid) return;
				if (result == null) setNotFound(true);
				markRead();
			});
		} else {
			markRead();
			setIsLoading(false);
		}
		// Kind of a HACK leaving this here, BUT...
		// since <CancelButton /> uses the OLD version of Button.js
		// and not Button.tsx (below), there's no way to keep the style.
		// if Buttons can be consolidated, this could go away
		const disposable = KeystrokeDispatcher.onKeyDown(
			"Escape",
			event => {
				if (event.key === "Escape" && event.target.id !== "input-div") exit();
			},
			{ source: "CodeErrorNav.tsx", level: -1 }
		);

		return () => {
			disposable && disposable.dispose();
			isValid = false;
		};
	});

	useEffect(() => {
		if (notFound || !codeError) {
			setError({
				title: "Cannot open Code Error",
				description:
					"This code error was not found. Perhaps it was deleted by the author, or you don't have permission to view it."
			});
		} else {
			if (derivedState.currentCodeErrorData) {
				if (!derivedState.currentCodeErrorData.parsedStack) {
					setError({
						title: "Missing Stack Trace",
						description:
							"This error report does not have a stack trace associated with it and cannot be displayed."
					});
				} else if (!derivedState.currentCodeErrorData.repo) {
					setError({
						title: "Missing Remote URL",
						description:
							"This error report does not have a remote URL associated with it and cannot be displayed."
					});
				}
			}
		}
	}, [notFound, codeError, derivedState.currentCodeErrorData]);

	if (derivedState.currentCodemarkId) return null;

	if (error) {
		return (
			<Dismissable
				title={error.title}
				buttons={[
					{
						text: "Dismiss",
						onClick: e => {
							e.preventDefault();
							exit();
						}
					}
				]}
			>
				<p>{error.description}</p>
			</Dismissable>
		);
	}

	if (isEditing) {
		return <CodeErrorForm />;
	}
	return (
		<Root>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					width: "100%"
				}}
			>
				{/* <div
					style={{
						width: "1px",
						height: "16px",
						background: "var(--base-border-color)",
						display: "inline-block",
						margin: "0 10px 0 0",
						flexGrow: 0
					}}
				/> */}
				<div style={{ marginLeft: "auto", marginRight: "13px", whiteSpace: "nowrap", flexGrow: 0 }}>
					<Icon
						className="clickable"
						name="x"
						onClick={exit}
						title="Close View"
						placement="bottomRight"
						delay={1}
					/>
				</div>
			</div>

			{!derivedState.isConnectedToNewRelic && (
				<div className="embedded-panel">
					<ConfigureNewRelic
						headerChildren={
							<div className="panel-header" style={{ background: "none" }}>
								<span className="panel-title">Connect to New Relic</span>
							</div>
						}
						showSignupUrl={false}
						providerId={"newrelic*com"}
						onClose={e => {
							dispatch(closeAllPanels());
						}}
						onSubmited={e => {
							// TODO something here?
							setLastUpdated(new Date());
						}}
					/>
				</div>
			)}
			{derivedState.isConnectedToNewRelic && (
				<>
					<NavHeader id="nav-header">
						<BaseCodeErrorHeader
							codeError={codeError!}
							collapsed={false}
							setIsEditing={setIsEditing}
						></BaseCodeErrorHeader>
					</NavHeader>
					{props.composeOpen ? null : (
						<div className="scroll-container">
							<ScrollBox>
								<div
									className="vscroll"
									id="code-error-container"
									style={{
										padding: "0 20px 60px 40px",
										width: "100%"
									}}
								>
									{/* TODO perhaps consolidate these? */}
									{derivedState.currentCodeErrorData && derivedState.currentCodeErrorData.warning && (
										<CodeErrorErrorBox>
											<Icon name="alert" className="alert" />
											<div className="message">
												{derivedState.currentCodeErrorData.warning
													.split("\n")
													.map(function(item, key) {
														return (
															<div key={"warning_" + key}>
																{item}
																<br />
															</div>
														);
													})}
											</div>
										</CodeErrorErrorBox>
									)}
									{derivedState.currentCodeErrorData && derivedState.currentCodeErrorData.error && (
										<CodeErrorErrorBox>
											<Icon name="alert" className="alert" />
											<div className="message">
												{derivedState.currentCodeErrorData.error
													.split("\n")
													.map(function(item, key) {
														return (
															<div key={"error_" + key}>
																{item}
																<br />
															</div>
														);
													})}
											</div>
										</CodeErrorErrorBox>
									)}
									<StyledCodeError className="pulse">
										<CodeError
											codeError={codeError!}
											stackFrameClickDisabled={!!derivedState.currentCodeErrorData?.error}
										/>
									</StyledCodeError>
								</div>
							</ScrollBox>
						</div>
					)}
				</>
			)}
		</Root>
	);
}
