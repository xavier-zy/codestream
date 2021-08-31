import React from "react";
import { useEffect } from "react";
import styled from "styled-components";
import { useDispatch, useSelector, shallowEqual } from "react-redux";
import { closeAllPanels, setCurrentCodeError } from "@codestream/webview/store/context/actions";
import { useDidMount } from "@codestream/webview/utilities/hooks";
import {
	fetchCodeError,
	fetchNewRelicErrorGroup,
	NewCodeErrorAttributes,
	resolveStackTrace
} from "@codestream/webview/store/codeErrors/actions";
import { CodeStreamState } from "../store";
import { getCodeError } from "../store/codeErrors/reducer";
import { Meta, BigTitle, Header } from "./Codemark/BaseCodemark";
import { closePanel, createPostAndCodeError, markItemRead } from "./actions";
import { Dispatch } from "../store/common";
import { CodeError, BaseCodeErrorHeader, ExpandedAuthor, Description } from "./CodeError";
import ScrollBox from "./ScrollBox";
import KeystrokeDispatcher from "../utilities/keystroke-dispatcher";
import { CodeErrorForm } from "./CodeErrorForm";
import { isFeatureEnabled } from "../store/apiVersioning/reducer";
import Icon from "./Icon";
import { isConnected } from "../store/providers/reducer";
import { ConfigureNewRelic } from "./ConfigureNewRelic";
import Dismissable from "./Dismissable";
import { bootstrapCodeErrors } from "@codestream/webview/store/codeErrors/actions";
import { DelayedRender } from "../Container/DelayedRender";
import { Loading } from "../Container/Loading";
import {
	GetNewRelicErrorGroupRequestType,
	GetNewRelicErrorGroupResponse,
	NewRelicErrorGroup
} from "@codestream/protocols/agent";
import { HostApi } from "..";
import { CSCodeError } from "@codestream/protocols/api";

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

/**
 * Called from InlineCodemarks it is what allows the commenting on lines of code
 *
 * @export
 * @param {Props} props
 * @return {*}
 */
export function CodeErrorNav(props: Props) {
	const dispatch = useDispatch<Dispatch | any>();
	const derivedState = useSelector((state: CodeStreamState) => {
		return {
			codeErrorStateBootstrapped: state.codeErrors.bootstrapped,
			currentCodeErrorId: state.context.currentCodeErrorId,
			currentCodeErrorData: state.context.currentCodeErrorData,
			pendingErrorGroupId: state.context.currentCodeErrorData?.pendingErrorGroupId,
			codeErrors: state.codeErrors,
			currentCodemarkId: state.context.currentCodemarkId,
			isConnectedToNewRelic: isConnected(state, { id: "newrelic*com" }),
			requiresConnection: state.context.currentCodeErrorData?.requiresConnection
		};
	}, shallowEqual);

	const [requiresConnection, setRequiresConnection] = React.useState<boolean | undefined>(
		undefined
	);
	const [isEditing, setIsEditing] = React.useState(false);

	const [isLoading, setIsLoading] = React.useState(true);
	const [error, setError] = React.useState<{ title: string; description: string } | undefined>(
		undefined
	);

	const [errorGroup, setErrorGroup] = React.useState<NewRelicErrorGroup | undefined>(undefined);

	const codeError = React.useMemo(() => {
		if (derivedState.currentCodeErrorId === "PENDING") return undefined;

		const codeError = getCodeError(
			derivedState.codeErrors,
			derivedState.currentCodeErrorId!
		) as CSCodeError;

		return codeError;
	}, [derivedState.codeErrors, derivedState.currentCodeErrorId, errorGroup]);

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

	useEffect(() => {
		if (!codeError || !codeError.objectId || !derivedState.isConnectedToNewRelic || errorGroup) {
			return;
		}

		(async () => {
			setIsLoading(true);
			const result: GetNewRelicErrorGroupResponse = await dispatch(
				fetchNewRelicErrorGroup({ errorGroupId: codeError.objectId! })
			);
			setErrorGroup(result.errorGroup);
			setIsLoading(false);
		})();
	}, [codeError, derivedState.isConnectedToNewRelic, errorGroup]);

	useEffect(() => {
		if (!errorGroup) return;

		if (!errorGroup.hasStackTrace) {
			setError({
				title: "Missing Stack Trace",
				description:
					"This error report does not have a stack trace associated with it and cannot be displayed."
			});
		} else if (!errorGroup.repo) {
			setError({
				title: "Missing Remote URL",
				description:
					"This error report does not have a remote URL associated with it and cannot be displayed."
			});
		}
	}, [errorGroup]);

	const onConnected = async () => {
		if (!derivedState.pendingErrorGroupId) {
			return;
		}
		setIsLoading(true);
		const errorGroupId = derivedState.pendingErrorGroupId;
		const errorGroupResult = await HostApi.instance.send(GetNewRelicErrorGroupRequestType, {
			errorGroupId: errorGroupId!
		});
		// "resolving" the stack trace here gives us two pieces of info for each line of the stack
		// the info parsed directly from the stack, and the "resolved" info that is specific to the
		// file the user has currently in their repo ... this position may be different if the user is
		// on a particular commit ... the "parsed" stack info is considered permanent, the "resolved"
		// stack info is considered ephemeral, since it only applies to the current user in the current state
		// resolved line number that gives the full path and line of the
		const stackInfo = (await resolveStackTrace(
			errorGroupResult.repo,
			errorGroupResult.sha,
			errorGroupResult.parsedStack
		)) as any;

		const newCodeError: NewCodeErrorAttributes = {
			objectId: errorGroupId,
			objectType: "ErrorGroup",
			title: errorGroupResult.errorGroup?.title || "",
			description: errorGroupResult.errorGroup?.message || "",
			stackTraces: stackInfo.error ? [{ ...stackInfo, lines: [] }] : [stackInfo.parsedStackInfo!], // storing the permanently parsed stack info
			providerUrl: ""
		};

		if (errorGroupResult?.errorGroup != null) {
			setErrorGroup(errorGroupResult.errorGroup!);
		}

		const response = (await dispatch(createPostAndCodeError(newCodeError))) as any;
		dispatch(
			setCurrentCodeError(response.codeError.id, {
				errorGroup: errorGroupResult?.errorGroup,
				repo: errorGroupResult?.repo,
				sha: errorGroupResult?.sha,
				parsedStack: errorGroupResult?.parsedStack,
				warning: stackInfo?.warning,
				error: stackInfo?.error
			})
		);

		setRequiresConnection(false);
		setIsLoading(false);
	};

	useDidMount(() => {
		if (derivedState.requiresConnection) {
			setRequiresConnection(derivedState.requiresConnection);
		} else if (derivedState.pendingErrorGroupId) {
			onConnected();
		} else {
			const onDidMount = () => {
				if (codeError) {
					setIsLoading(false);
				} else {
					dispatch(fetchCodeError(derivedState.currentCodeErrorId!))
						.then((_: any) => {
							if (!_ || !_.payload.length) {
								setError({
									title: "Cannot open Code Error",
									description:
										"This code error was not found. Perhaps it was deleted by the author, or you don't have permission to view it."
								});
							} else {
								markRead();
							}
						})
						.then(() => {
							setIsLoading(false);
						});
				}
			};
			if (!derivedState.codeErrorStateBootstrapped) {
				dispatch(bootstrapCodeErrors()).then(() => {
					onDidMount();
				});
			} else {
				onDidMount();
			}
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
		};
	});

	// if for some reason we have a codemark, don't render anything
	if (derivedState.currentCodemarkId) return null;

	if (error) {
		// essentially a roadblock
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

	if (requiresConnection) {
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
						style={{ marginLeft: "auto", marginRight: "13px", whiteSpace: "nowrap", flexGrow: 0 }}
					>
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

				<div className="embedded-panel">
					<ConfigureNewRelic
						headerChildren={
							<div className="panel-header" style={{ background: "none" }}>
								<span className="panel-title">Connect to New Relic</span>
							</div>
						}
						disablePostConnectOnboarding={true}
						showSignupUrl={false}
						providerId={"newrelic*com"}
						onClose={e => {
							dispatch(closeAllPanels());
						}}
						onSubmited={async e => {
							onConnected();
						}}
					/>
				</div>
			</Root>
		);
	}
	if (isLoading && !codeError) {
		return (
			<DelayedRender>
				<Loading />
			</DelayedRender>
		);
	}

	if (isEditing && codeError) {
		return <CodeErrorForm editingCodeError={codeError} />;
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

			<>
				<NavHeader id="nav-header">
					<BaseCodeErrorHeader
						codeError={codeError!}
						errorGroup={errorGroup}
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
											{derivedState.currentCodeErrorData.error.split("\n").map(function(item, key) {
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
										errorGroup={errorGroup}
										stackFrameClickDisabled={!!derivedState.currentCodeErrorData?.error}
									/>
								</StyledCodeError>
							</div>
						</ScrollBox>
					</div>
				)}
			</>
		</Root>
	);
}
