import React, { useState, useEffect, useCallback, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import CancelButton from "./CancelButton";
import { HostApi } from "../webview-api";
import { Button } from "../src/components/Button";
import styled from "styled-components";
import { TextInput } from "../Authentication/TextInput";
import { logError } from "../logger";
import { FormattedMessage } from "react-intl";
import cx from "classnames";
import { Link } from "./Link";
import { DropdownButton } from "./Review/DropdownButton";
import { LoadingMessage } from "../src/components/LoadingMessage";
import {
	CreatePullRequestRequestType,
	CheckPullRequestBranchPreconditionsRequestType,
	CheckPullRequestBranchPreconditionsResponse,
	CheckPullRequestPreconditionsRequestType,
	ChangeDataType,
	DidChangeDataNotificationType
} from "@codestream/protocols/agent";
import { connectProvider } from "./actions";
import { isConnected } from "../store/providers/reducer";
import { CodeStreamState } from "../store";
import { inMillis } from "../utils";
import { useInterval, useTimeout } from "../utilities/hooks";
import { setCurrentReview, openPanel } from "../store/context/actions";
import { PROVIDER_MAPPINGS } from "./CrossPostIssueControls/types";
import { PrePRProviderInfoModal } from "./PrePRProviderInfoModal";
import Icon from "./Icon";
import { OpenUrlRequestType } from "@codestream/protocols/webview";
import { Checkbox } from "../src/components/Checkbox";

export const ButtonRow = styled.div`
	text-align: center;
	margin-top: 20px;
	button {
		width: 18em;
	}
`;
const Root = styled.div`
	#controls {
		padding-top: 10px;
	}
`;

// select service
const Step1 = props => (props.step !== 1 ? null : <div>{props.children}</div>);

// service loading
const Step2 = props => (props.step !== 2 ? null : <div>{props.children}</div>);

// form
const Step3 = props => (props.step !== 3 ? null : <div>{props.children}</div>);

export const CreatePullRequestPanel = props => {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const { providers } = state;
		const codeHostProviders = Object.keys(providers).filter(id =>
			[
				"github",
				"gitlab",
				"github_enterprise",
				"gitlab_enterprise",
				"bitbucket",
				"bitbucket_server"
			].includes(providers[id].name)
		);
		return {
			providers: providers,
			codeHostProviders: codeHostProviders,
			reviewId: state.context.createPullRequestReviewId,
			isConnectedToGitHub: isConnected(state, { name: "github" }),
			isConnectedToGitLab: isConnected(state, { name: "gitlab" }),
			isConnectedToGitHubEnterprise: isConnected(state, { name: "github_enterprise" }),
			isConnectedToGitLabEnterprise: isConnected(state, { name: "gitlab_enterprise" }),
			isConnectedToBitbucket: isConnected(state, { name: "bitbucket" }),
			isConnectedToBitbucketServer: isConnected(state, { name: "bitbucket_server" })
		};
	});
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);

	const [preconditionError, setPreconditionError] = useState({ message: "", type: "", url: "" });
	const [unexpectedError, setUnexpectedError] = useState(false);

	const [formState, setFormState] = useState({ message: "", type: "", url: "" });
	const [titleValidity, setTitleValidity] = useState(true);
	const pauseDataNotifications = useRef(false);

	const [reviewBranch, setReviewBranch] = useState("");
	const [branches, setBranches] = useState([] as string[]);
	const [requiresUpstream, setRequiresUpstream] = useState(false);
	const [origins, setOrigins] = useState([] as string[]);

	// states used to create the eventual pr
	const [prBranch, setPrBranch] = useState("");
	const [prTitle, setPrTitle] = useState("");
	const [prText, setPrText] = useState("");
	const [prRemoteUrl, setPrRemoteUrl] = useState("");
	const [prProviderId, setPrProviderId] = useState("");
	const [prProviderIconName, setPrProviderIconName] = useState("");
	const [prUpstreamOn, setPrUpstreamOn] = useState(true);
	const [prUpstream, setPrUpstream] = useState("");

	const [currentStep, setCurrentStep] = useState(0);

	const [isWaiting, setIsWaiting] = useState(false);
	const [propsForPrePRProviderInfoModal, setPropsForPrePRProviderInfoModal] = useState<any>();

	const stopWaiting = useCallback(() => {
		setIsWaiting(false);
	}, [isWaiting]);

	const waitFor = inMillis(60, "sec");
	useTimeout(stopWaiting, waitFor);

	const fetchPreconditionData = async () => {
		setFormState({ type: "", message: "", url: "" });
		setPreconditionError({ type: "", message: "", url: "" });
		// already waiting on a provider auth, keep using that loading ui
		if (currentStep != 2) {
			setLoading(true);
			setCurrentStep(0);
		}

		try {
			const result = await HostApi.instance.send(CheckPullRequestPreconditionsRequestType, {
				reviewId: derivedState.reviewId!
			});
			if (result && result.success) {
				setReviewBranch(result.branch!);
				setBranches(result.branches!);
				if (result.pullRequestProvider && result.pullRequestProvider.defaultBranch) {
					setPrBranch(result.pullRequestProvider.defaultBranch!);
				}

				setPrRemoteUrl(result.remoteUrl!);
				setPrTitle(result.review!.title!);
				setPrText(result.review!.text!);
				setPrProviderId(result.providerId!);

				setCurrentStep(3);
				if (result.warning && result.warning.type) {
					// if we get a warning, show the error, but continue
					// to show the form, this is most likely a PR already exists
					setPreconditionError({
						type: result.warning.type,
						message: result.warning.message || "",
						url: result.warning.url || ""
					});
					if (result.warning.type === "REQUIRES_UPSTREAM") {
						setRequiresUpstream(true);
						setOrigins(result.origins!);
						setPrUpstream(result.origins![0]);
					}
				} else {
					setPreconditionError({ type: "", message: "", url: "" });
				}
			} else if (result && result.error && result.error.type) {
				if (result.error.type === "REQUIRES_PROVIDER") {
					setCurrentStep(1);
				} else {
					setPreconditionError({
						type: result.error.type || "UNKNOWN",
						message: result.error.message || "",
						url: result.error.url || ""
					});
				}
			}
		} catch (ex) {
			logError(`Unexpected error during pull request precondition check: ${ex.message}`, {
				reviewId: derivedState.reviewId
			});
			setUnexpectedError(true);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchPreconditionData();
	}, [
		derivedState.isConnectedToGitHub,
		derivedState.isConnectedToGitLab,
		derivedState.isConnectedToGitHubEnterprise,
		derivedState.isConnectedToGitLabEnterprise,
		derivedState.isConnectedToBitbucket,
		derivedState.isConnectedToBitbucketServer
	]);

	useEffect(() => {
		if (prProviderId) {
			const provider = derivedState.providers[prProviderId];
			const { name } = provider;
			const display = PROVIDER_MAPPINGS[name];
			if (display && display.icon) {
				setPrProviderIconName(display.icon!);
			}
		}
	}, [prProviderId]);

	useEffect(() => {
		fetchPreconditionData();

		const disposable = HostApi.instance.on(DidChangeDataNotificationType, (e: any) => {
			if (pauseDataNotifications.current) return;
			if (e.type === ChangeDataType.Commits) {
				fetchPreconditionData();
			}
		});
		return () => {
			disposable.dispose();
		};
	}, []);

	const isTitleValid = (title: string) => title != null && title !== "";

	const onValidityChanged = useCallback((field: string, validity: boolean) => {
		switch (field) {
			case "title":
				setTitleValidity(validity);
				break;
			default: {
			}
		}
	}, []);

	const onSubmit = async (event: React.SyntheticEvent) => {
		setUnexpectedError(false);
		pauseDataNotifications.current = true;
		onValidityChanged("title", isTitleValid(prTitle));
		if (!titleValidity) return;

		let success = false;
		setSubmitting(true);
		setFormState({ message: "", type: "", url: "" });
		setPreconditionError({ message: "", type: "", url: "" });
		try {
			const result = await HostApi.instance.send(CreatePullRequestRequestType, {
				reviewId: derivedState.reviewId!,
				providerId: prProviderId,
				title: prTitle,
				description: prText,
				baseRefName: prBranch,
				headRefName: reviewBranch,
				remote: prRemoteUrl,
				remoteName: prUpstreamOn && prUpstream ? prUpstream : undefined
			});
			if (result.error) {
				setFormState({
					message: result.error.message || "",
					type: result.error.type || "UNKNOWN",
					url: result.error.url || ""
				});
			} else {
				HostApi.instance.track("Pull Request Created", {
					Service: prProviderId
				});
				success = true;
				setFormState({ message: "", type: "", url: "" });
				props.closePanel();
				dispatch(setCurrentReview(derivedState.reviewId!));
			}
		} catch (error) {
			logError(`Unexpected error during pull request creation: ${error}`, {});
			setUnexpectedError(true);
		} finally {
			setSubmitting(false);
			if (!success) {
				// resume the DataNotifications
				// if we didn't succeed...
				// if we were a success, the panel will just close
				pauseDataNotifications.current = false;
			}
		}
	};

	const renderBranchesDropdown = () => {
		const items = branches!.map(_ => {
			return {
				label: _,
				key: _,
				action: () => {
					// optimistically
					setPrBranch(_);
					HostApi.instance
						.send(CheckPullRequestBranchPreconditionsRequestType, {
							reviewId: derivedState.reviewId!,
							providerId: prProviderId,
							baseRefName: _,
							headRefName: reviewBranch
						})
						.then((result: CheckPullRequestBranchPreconditionsResponse) => {
							setPreconditionError({ type: "", message: "", url: "" });
							setFormState({ type: "", message: "", url: "" });
							if (result && result.error) {
								setFormState({
									type: result.error.type || "UNKNOWN",
									message: result.error.message || "",
									url: result.error.url || ""
								});
							} else {
								setFormState({ type: "", message: "", url: "" });
							}
						});
				}
			};
		});
		if (items.length === 0) return undefined;
		return (
			<span>
				<DropdownButton variant="text" items={items}>
					<strong>{prBranch || reviewBranch}</strong>
				</DropdownButton>
			</span>
		);
	};

	const renderDisplayHost = host => {
		return host.startsWith("http://")
			? host.split("http://")[1]
			: host.startsWith("https://")
			? host.split("https://")[1]
			: host;
	};

	const renderProviders = () => {
		const { codeHostProviders, providers } = derivedState;
		let items = codeHostProviders.map(providerId => {
			const provider = providers[providerId];
			const { name, isEnterprise, host, needsConfigure, forEnterprise } = provider;
			const display = PROVIDER_MAPPINGS[name];
			if (!display) return null;

			const displayHost = renderDisplayHost(host);
			const displayName = isEnterprise
				? `${display.displayName} - ${displayHost}`
				: display.displayName;
			let action;
			if (needsConfigure) {
				// otherwise, if it's a provider that needs to be pre-configured,
				// bring up the custom popup for configuring it
				action = () =>
					dispatch(openPanel(`configure-provider-${name}-${providerId}-Integrations Panel`));
			} else if ((forEnterprise || isEnterprise) && name !== "jiraserver") {
				// otherwise if it's for an enterprise provider, configure for enterprise
				action = () => {
					dispatch(openPanel(`configure-enterprise-${name}-${providerId}-Integrations Panel`));
				};
			} else {
				// otherwise it's just a simple oauth redirect
				if (name === "github" || name === "bitbucket" || name === "gitlab") {
					action = () => {
						setPrProviderId(providerId);
						setPropsForPrePRProviderInfoModal({
							providerName: name,
							action: () => {
								dispatch(connectProvider(providerId, "Create Pull Request Panel"));
								setIsWaiting(true);
							},
							onClose: () => {
								setPropsForPrePRProviderInfoModal(undefined);
								setIsWaiting(true);
								setCurrentStep(2);
							}
						});
					};
				} else {
					action = () => {
						setPrProviderId(providerId);
						dispatch(connectProvider(providerId, "Create Pull Request Panel"));
						setIsWaiting(true);
						setCurrentStep(2);
					};
				}
			}

			return {
				label: (
					<span>
						{display.icon ? <Icon name={display.icon} style={{ marginRight: "4px" }} /> : undefined}
						{displayName}
					</span>
				),
				key: providerId,
				action: action
			};
		});
		const filteredItems = items.filter(Boolean) as any;
		if (!filteredItems.length) return undefined;

		return (
			<span>
				<DropdownButton variant="text" items={filteredItems}>
					<strong>select service</strong>
				</DropdownButton>
			</span>
		);
	};

	const preconditionErrorMessages = () => {
		if (preconditionError && preconditionError.type) {
			let preconditionErrorMessageElement = getErrorElement(
				preconditionError.type,
				preconditionError.message,
				preconditionError.url
			);
			if (preconditionErrorMessageElement) {
				return <div className="error-message form-error">{preconditionErrorMessageElement}</div>;
			}
		}
		return undefined;
	};

	const formErrorMessages = () => {
		if (!formState || !formState.type) return undefined;

		let formErrorMessageElement = getErrorElement(formState.type, formState.message, formState.url);
		if (formErrorMessageElement) {
			return <div className="error-message form-error">{formErrorMessageElement}</div>;
		}
		return undefined;
	};

	const getErrorElement = (type, message, url) => {
		let messageElement = <></>;
		switch (type) {
			// TODO move these into en.js
			case "REPO_NOT_FOUND": {
				messageElement = <span>Repo not found</span>;
				break;
			}
			case "BRANCH_REMOTE_CREATION_FAILED": {
				messageElement = <span>Could not create branch remote</span>;
				break;
			}
			case "REPO_NOT_OPEN": {
				messageElement = <span>Repo not currently open</span>;
				break;
			}
			case "REQUIRES_UPSTREAM": {
				// no message for this
				// we show additional UI for this
				break;
			}
			case "HAS_LOCAL_COMMITS": {
				messageElement = (
					<span>
						A PR can’t be created because the code review includes local commits. Push your changes
						and then <Link onClick={onClickTryAgain}>try again</Link>
					</span>
				);
				break;
			}
			case "HAS_LOCAL_MODIFICATIONS": {
				messageElement = (
					<span>
						A PR can’t be created because the code review includes uncommitted changes. Commit and
						push your changes and then <Link onClick={onClickTryAgain}>try again</Link>.
					</span>
				);
				break;
			}
			case "ALREADY_HAS_PULL_REQUEST": {
				if (url) {
					messageElement = (
						<span>
							There is already an{" "}
							<a
								href="#"
								title="View this Pull Request"
								onClick={e => {
									e.preventDefault();
									HostApi.instance.send(OpenUrlRequestType, {
										url: url!
									});
								}}
							>
								open PR
							</a>{" "}
							for this branch
						</span>
					);
				} else {
					messageElement = <span>There is already an open PR for this branch</span>;
				}
				break;
			}
			case "PROVIDER": {
				messageElement = (
					<span
						dangerouslySetInnerHTML={{
							__html: message.replace(/\n/g, "<br />") || "Unknown provider error"
						}}
					/>
				);
				break;
			}
			default: {
				messageElement = <span>{message || "Unknown error"}</span>;
			}
		}
		return messageElement;
	};

	const onClickTryAgain = (event: React.SyntheticEvent) => {
		event.preventDefault();
		fetchPreconditionData();
	};

	const onClickTryReauthAgain = (event: React.SyntheticEvent) => {
		event.preventDefault();
		if (prProviderId) {
			setCurrentStep(1);
		} else {
			fetchPreconditionData();
		}
	};

	function LoadingEllipsis() {
		const [dots, setDots] = useState(".");
		useInterval(() => {
			switch (dots) {
				case ".":
					return setDots("..");
				case "..":
					return setDots("...");
				case "...":
					return setDots(".");
			}
		}, 500);

		return <React.Fragment>{dots}</React.Fragment>;
	}

	const providerAuthenticationMessage = () => {
		let providerName = "Provider";
		if (prProviderId) {
			const provider = derivedState.providers[prProviderId];
			const { name } = provider;
			const display = PROVIDER_MAPPINGS[name];
			if (display) providerName = display.displayName;
		}

		return isWaiting ? (
			<strong>
				Waiting for {providerName} authentication <LoadingEllipsis />
			</strong>
		) : (
			<strong>
				Authentication timed out. Please <Link onClick={onClickTryReauthAgain}>try again</Link>.
			</strong>
		);
	};

	if (propsForPrePRProviderInfoModal) {
		return <PrePRProviderInfoModal {...propsForPrePRProviderInfoModal} />;
	}

	return (
		<Root className="full-height-panel">
			<form className="standard-form vscroll">
				<div className="panel-header">
					<CancelButton onClick={props.closePanel} />
				</div>
				<fieldset className="form-body" style={{ width: "85%", padding: "20px 0" }}>
					<div className="outline-box">
						<h3>Open a Pull Request</h3>
						<div id="controls">
							{!loading && preconditionError.type && preconditionErrorMessages()}
							{!loading && formErrorMessages()}
							{loading && <LoadingMessage>Loading repo info...</LoadingMessage>}
							<Step1 step={currentStep}>
								<div>Open a pull request on {renderProviders()}</div>
							</Step1>
							<Step2 step={currentStep}>{providerAuthenticationMessage()}</Step2>
							<Step3 step={currentStep}>
								<div className="small-spacer" />
								{unexpectedError && (
									<div className="error-message form-error">
										<FormattedMessage
											id="error.unexpected"
											defaultMessage="Something went wrong! Please try again, or "
										/>
										<FormattedMessage id="contactSupport" defaultMessage="contact support">
											{text => <Link href="https://help.codestream.com">{text}</Link>}
										</FormattedMessage>
										.
									</div>
								)}
								<div className="control-group">
									<div>
										<span>
											Compare <strong>{reviewBranch}</strong> against{" "}
										</span>
										{renderBranchesDropdown()}
									</div>
								</div>
								<div className="control-group">
									<TextInput
										name="title"
										value={prTitle}
										placeholder="Pull request title"
										autoFocus
										onChange={setPrTitle}
										onValidityChanged={onValidityChanged}
										validate={isTitleValid}
									/>
									{!titleValidity && (
										<small className={cx("explainer", { "error-message": !titleValidity })}>
											<FormattedMessage id="pullRequest.title" />
										</small>
									)}
								</div>
								<div className="control-group">
									<textarea
										className="input-text"
										name="description"
										rows={4}
										value={prText}
										onChange={e => setPrText(e.target.value)}
										placeholder="Pull request description (optional)"
									/>
								</div>
								{requiresUpstream && origins && origins.length && (
									<div className="control-group">
										<Checkbox
											name="set-upstream"
											checked={prUpstreamOn}
											onChange={e => {
												const val = e.valueOf();
												setPrUpstreamOn(val);
												if (origins && origins.length === 1) {
													if (val) {
														setPrUpstream(origins[0]);
													}
												}
											}}
										>
											<span>Set upstream to </span>
											{origins.length > 1 && (
												<DropdownButton
													variant="text"
													items={origins.map((_: any) => {
														return {
															label: `${_}/${reviewBranch}`,
															key: _,
															action: () => {
																setPrUpstream(_);
															}
														};
													})}
												>
													<strong
														title={`This will run 'git push -u ${prUpstream} ${reviewBranch}'`}
													>{`${origins[0]}/${reviewBranch}`}</strong>
												</DropdownButton>
											)}
											{origins.length === 1 && (
												<strong
													title={`This will run 'git push -u ${prUpstream} ${reviewBranch}'`}
												>{`${origins[0]}/${reviewBranch}`}</strong>
											)}
										</Checkbox>
									</div>
								)}

								<ButtonRow>
									<Button onClick={onSubmit} isLoading={submitting}>
										{prProviderIconName && (
											<Icon name={prProviderIconName} style={{ marginRight: "3px" }} />
										)}
										Create Pull Request
									</Button>
								</ButtonRow>
							</Step3>
						</div>
					</div>
				</fieldset>
			</form>
		</Root>
	);
};
