import React from "react";
import { useEffect } from "react";
import styled from "styled-components";
import { useDispatch, useSelector } from "react-redux";
import { closeAllPanels, setCurrentCodeError } from "@codestream/webview/store/context/actions";
import { useDidMount } from "@codestream/webview/utilities/hooks";
import {
	api,
	fetchCodeError,
	fetchErrorGroup,
	NewCodeErrorAttributes,
	resolveStackTrace,
	setErrorGroup
} from "@codestream/webview/store/codeErrors/actions";
import { CodeStreamState } from "../store";
import { getCodeError, getErrorGroup } from "../store/codeErrors/reducer";
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
	GetReposScmRequestType,
	ReposScm,
	ResolveStackTraceResponse
} from "@codestream/protocols/agent";
import { HostApi } from "..";
import { CSCodeError } from "@codestream/protocols/api";
import { DropdownButton } from "./DropdownButton";
import { logWarning } from "../logger";

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

interface EnhancedRepoScm {
	/**
	 * name of the repo
	 */
	name: string;
	/**
	 * remote url
	 */
	remote: string;
}
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
		const codeError = state.context.currentCodeErrorId
			? (getCodeError(state.codeErrors, state.context.currentCodeErrorId) as CSCodeError)
			: undefined;
		const errorGroup = getErrorGroup(state.codeErrors, codeError);

		const result = {
			codeErrorStateBootstrapped: state.codeErrors.bootstrapped,
			currentCodeErrorId: state.context.currentCodeErrorId,
			currentCodeErrorData: state.context.currentCodeErrorData,

			codeError: codeError,
			currentCodemarkId: state.context.currentCodemarkId,
			isConnectedToNewRelic: isConnected(state, { id: "newrelic*com" }),
			errorGroup: errorGroup,
			repos: state.repos
		};
		// console.warn(JSON.stringify(result, null, 4));
		return result;
	});

	const [requiresConnection, setRequiresConnection] = React.useState<boolean | undefined>(
		undefined
	);
	const [isEditing, setIsEditing] = React.useState(false);
	const [isLoading, setIsLoading] = React.useState(true);
	const [error, setError] = React.useState<{ title: string; description: string } | undefined>(
		undefined
	);
	const [openRepositories, setOpenRepositories] = React.useState<
		(ReposScm & EnhancedRepoScm)[] | undefined
	>(undefined);
	const [repositoryError, setRepositoryError] = React.useState<
		{ title: string; description: string } | undefined
	>(undefined);

	const { codeError, errorGroup } = derivedState;

	const pendingErrorGroupId = derivedState.currentCodeErrorData?.pendingErrorGroupId;
	const traceId = derivedState.currentCodeErrorData?.traceId;
	const pendingRequiresConnection = derivedState.currentCodeErrorData?.pendingRequiresConnection;

	const exit = async () => {
		// clear out the current code error (set to blank) in the webview
		await dispatch(setCurrentCodeError(undefined, undefined));
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

		setIsLoading(true);
		dispatch(fetchErrorGroup(codeError));
		setTimeout(() => {
			setIsLoading(false);
		}, 1);
	}, [codeError, derivedState.isConnectedToNewRelic, errorGroup]);

	useEffect(() => {
		if (!errorGroup) return;

		if (!errorGroup.hasStackTrace) {
			setError({
				title: "Missing Stack Trace",
				description:
					"This error report does not have a stack trace associated with it and cannot be displayed."
			});
		}
	}, [errorGroup]);

	useEffect(() => {
		if (!errorGroup) return;

		if (!errorGroup.repo || !errorGroup.repo.url) {
			setRepositoryError({
				title: "Missing Repository Info",
				description: `In order to view this stack trace, please select a repository to associate with ${
					errorGroup ? errorGroup.entityName + " " : ""
				}on New Relic.`
			});
		}
		if (errorGroup.repo?.url && repositoryError) {
			setRepositoryError(undefined);
		}
	}, [errorGroup, errorGroup?.repo]);

	useEffect(() => {
		if (!repositoryError) return;

		HostApi.instance
			.send(GetReposScmRequestType, {
				inEditorOnly: true,
				includeRemotes: true
			})
			.then(_ => {
				if (!_.repositories) return;

				const results: (ReposScm & EnhancedRepoScm)[] = [];
				for (const repo of _.repositories) {
					if (repo.remotes && repo.remotes.length > 1) {
						for (const e of repo.remotes) {
							const id = repo.id || "";
							const remoteUrl = e?.types?.find(_ => _.type === "fetch")?.url;
							results.push({
								...repo,
								remote: remoteUrl,
								name:
									(derivedState.repos[id] ? derivedState.repos[id].name : "") + ` (${remoteUrl})`
							});
						}
					} else {
						const id = repo.id || "";
						results.push({
							...repo,
							remote: repo.remotes![0]?.types?.find(_ => _.type === "fetch")?.url!,
							name: derivedState.repos[id] ? derivedState.repos[id].name : ""
						});
					}
				}

				setOpenRepositories(results);
			})
			.catch(e => {
				logWarning(`could not get repos: ${e.message}`);
			});
	}, [repositoryError]);

	const onConnected = async () => {
		console.warn("onConnected starting...");
		if (!pendingErrorGroupId) {
			return;
		}
		console.warn("onConnected started");

		setIsLoading(true);
		try {
			const errorGroupId = pendingErrorGroupId;
			const errorGroupResult = await HostApi.instance.send(GetNewRelicErrorGroupRequestType, {
				errorGroupId: errorGroupId!,
				traceId: traceId!
			});

			const stackInfo = (await resolveStackTrace(
				errorGroupResult.errorGroup?.repo || "",
				errorGroupResult.sha,
				traceId!,
				errorGroupResult.errorGroup?.errorTrace!?.stackTrace.map(_ => _.formatted)
			)) as ResolveStackTraceResponse;

			const newCodeError: NewCodeErrorAttributes = {
				accountId: errorGroupResult.accountId,
				objectId: errorGroupId,
				objectType: "ErrorGroup",
				title: errorGroupResult.errorGroup?.title || "",
				text: errorGroupResult.errorGroup?.message || undefined,
				stackTraces: stackInfo.error ? [{ ...stackInfo, lines: [] }] : [stackInfo.parsedStackInfo!], // storing the permanently parsed stack info
				providerUrl: "",
				objectInfo: {
					entityName: errorGroupResult?.errorGroup?.entityName
				}
			};

			const response = (await dispatch(createPostAndCodeError(newCodeError))) as any;
			if (errorGroupResult?.errorGroup != null) {
				dispatch(setErrorGroup(errorGroupId, errorGroupResult.errorGroup!));
			}
			dispatch(
				setCurrentCodeError(response.codeError.id, {
					// need to reset this back to undefined now that we aren't
					// pending any longer
					pendingErrorGroupId: undefined,
					errorGroup: errorGroupResult?.errorGroup,
					repo: errorGroupResult?.repo,
					sha: errorGroupResult?.sha,
					// parsedStack: errorGroupResult?.parsedStack,
					warning: stackInfo?.warning,
					error: stackInfo?.error
				})
			);
		} catch (ex) {
			console.warn(ex);
			setError({
				title: "Unexpected Error",
				description: ex.message
			});
		} finally {
			setRequiresConnection(false);
			setIsLoading(false);
		}
	};

	useDidMount(() => {
		if (pendingRequiresConnection) {
			setRequiresConnection(pendingRequiresConnection);
		} else if (pendingErrorGroupId) {
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
						.catch(ex => {
							setError({
								title: "Error",
								description: ex.message ? ex.message : ex.toString()
							});
						})
						.finally(() => {
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

	if (repositoryError) {
		// essentially a roadblock
		return (
			<Dismissable
				title={repositoryError.title}
				buttons={[
					{
						text: "Cancel",
						onClick: e => {
							e.preventDefault();
							exit();
						}
					},
					{
						text: "Associate",
						onClick: e => {
							e.preventDefault();
							exit();
						}
					}
				]}
			>
				<p>{repositoryError.description}</p>
				<DropdownButton
					items={
						openRepositories?.map((_, index) => {
							return {
								key: _.id! + index,
								label: _.name,
								action: () => {
									dispatch(
										api("assignRepository", {
											url: _.remote,
											name: _.name,
											errorGroupId: codeError?.objectId!
										})
									);
								}
							};
						}) || []
					}
					variant="secondary"
					size="compact"
					wrap
				>
					select a repo
				</DropdownButton>
			</Dismissable>
		);
	}
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
							<>
								<div className="panel-header" style={{ background: "none" }}>
									<span className="panel-title">Connect to New Relic</span>
								</div>
								<div style={{ textAlign: "center" }}>
									Working with errors requires a connection to your New Relic account.
								</div>
							</>
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
