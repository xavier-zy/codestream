import React from "react";
import styled from "styled-components";
import { Button } from "../src/components/Button";
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
import { Modal } from "./Modal";
import KeystrokeDispatcher from "../utilities/keystroke-dispatcher";
import { CodeErrorForm } from "./CodeErrorForm";
import { isFeatureEnabled } from "../store/apiVersioning/reducer";
import { getSidebarLocation } from "../store/editorContext/reducer";
import Icon from "./Icon";
import { Link } from "./Link";
import Tooltip from "./Tooltip";
import { isConnected } from "../store/providers/reducer";
import { ConfigureNewRelic } from "./ConfigureNewRelic";

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

const Nav = styled.div`
	white-space: nowrap;
	margin-left: auto;
	margin: 15px 0 5px 20px;
	z-index: 50;
	&.pulse {
		opacity: 1 !important;
	}
	.btn-group {
		display: inline-block;
		margin-left: 8px;
		transition: transform 0.1s;
		transform-origin: 50% 0%;
		&:last-child {
			transform-origin: 100% 0%;
		}
		button {
			margin-left: 10px;
			&:first-child {
				margin-left: 0;
			}
			.narrow-icon {
				// display: none;
				margin-right: 5px;
			}
		}
	}
`;
const ClearModal = styled.div`
	position: absolute;
	z-index: 51;
	width: 100%;
	height: 100%;
	top: 0;
	left: 0;
`;
const Root = styled.div`
	max-height: 100%;
	display: flex;
	flex-direction: column;
	&.tour-on {
		${Nav},
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

export const ComposeArea = styled.div<{ side: "right" | "left" }>`
	width: 35px;
	height: 100%;
	position: fixed;
	left: ${props => (props.side === "right" ? "-36px" : "auto")};
	right: ${props => (props.side === "left" ? "-36px" : "auto")};
	top: 0;
	transition: left 0.1s;
	// background: var(--base-background-color);
	// border-right: 1px solid var(--base-border-color);
	background: var(--button-background-color);
	&.pulse {
		left: ${props => (props.side === "right" ? "0" : "auto")};
		right: ${props => (props.side === "left" ? "0" : "auto")};
		z-index: 5;
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
			codeError,
			currentCodemarkId: state.context.currentCodemarkId,
			isInVscode: state.ide.name === "VSC",
			isMine: currentUserId === (codeError ? codeError.creatorId : ""),
			sidebarLocation: getSidebarLocation(state),
			isConnectedToNewRelic: isConnected(state, { id: "newrelic*com" })
		};
	}, shallowEqual);

	const [isEditing, setIsEditing] = React.useState(false);
	const [notFound, setNotFound] = React.useState(false);
	const [lastUpdated, setLastUpdated] = React.useState(new Date());

	const { codeError } = derivedState;

	const exit = async () => {
		// clear out the current code error (set to blank) in the webview
		await dispatch(setCurrentCodeError());
		dispatch(closePanel());
	};

	const showCodeError = async () => {
		await dispatch(setCurrentCodeError(codeError && codeError.id));
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
		if (codeError == null) {
			dispatch(fetchCodeError(props.codeErrorId)).then(result => {
				if (!isValid) return;
				if (result == null) setNotFound(true);
				markRead();
			});
		} else {
			markRead();
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

	if (notFound || !codeError)
		return (
			<Modal verticallyCenter={true} onClose={exit}>
				<MinimumWidthCard>
					This code error was not found. Perhaps it was deleted by the author, or you don't have
					permission to view it.
					<br />
					<br />
					<Button onClick={exit}>Exit</Button>
				</MinimumWidthCard>
			</Modal>
		);
	if (derivedState.currentCodemarkId) return null;

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
				<div
					style={{
						width: "1px",
						height: "16px",
						background: "var(--base-border-color)",
						display: "inline-block",
						margin: "0 10px 0 0",
						flexGrow: 0
					}}
				/>
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
							codeError={codeError}
							collapsed={false}
							setIsEditing={setIsEditing}
						>
							<></>
						</BaseCodeErrorHeader>
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
									<StyledCodeError className="pulse">
										<CodeError codeError={codeError} />
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
