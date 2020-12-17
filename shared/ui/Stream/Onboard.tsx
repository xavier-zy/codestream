import { WebviewModals, WebviewPanels } from "@codestream/protocols/webview";
import React, { useState, useEffect, useMemo } from "react";
import { shallowEqual, useDispatch, useSelector } from "react-redux";
import styled from "styled-components";
import { CodeStreamState } from "../store";
import { getPreferences, getTeamMates } from "../store/users/reducer";
import { useDidMount } from "../utilities/hooks";
import { HostApi } from "../webview-api";
import { closePanel } from "./actions";
import CancelButton from "./CancelButton";
import { GetLatestCommittersRequestType } from "@codestream/protocols/agent";
import { difference as _difference, sortBy as _sortBy } from "lodash-es";
import { Checkbox } from "../src/components/Checkbox";
import { CSText } from "../src/components/CSText";
import { Button } from "../src/components/Button";
import { Link } from "./Link";
import Icon from "./Icon";
import { confirmPopup } from "./Confirm";
import { Dialog } from "../src/components/Dialog";
import { IntegrationButtons, Provider } from "./IntegrationsPanel";
import { PROVIDER_MAPPINGS } from "./CrossPostIssueControls/types";
import { configureAndConnectProvider } from "../store/providers/actions";
import ComposeTitles, { ComposeKeybindings } from "./ComposeTitles";
import { CreateCodemarkIcons } from "./CreateCodemarkIcons";
import { isConnected } from "../store/providers/reducer";

const EMPTY_ARRAY = [];
const EMPTY_HASH = {};

export const STEPS = [{}, {}, {}, {}, {}, {}];

const Step = styled.div`
	margin: 0 auto;
	text-align: left;
	position: absolute;
	display: none;
	opacity: 0;
	justify-content: center;
	align-items: center;
	flex-direction: row;
	top: 0;
	left: 0;
	width: 100%;
	min-height: 100vh;
	.body {
		padding: 40px 20px 20px 20px;
		margin-bottom: 40px;
		max-width: 450px;
		pointer-events: none;
	}
	p {
		margin-top: 0.5em;
		color: var(--text-color-subtle);
	}
	h1,
	h2,
	h3 {
		color: var(--text-color-highlight);
		margin: 0 0 0 0;
		text-align: center;
	}
	h1 {
		font-size: 32px;
		margin-bottom: 10px;
		.icon {
			font-size: 24px;
			line-height: 1;
			display: inline-block;
			opacity: 0.5;
			transform: scale(5);
			animation-duration: 2s;
			animation-timing-function: ease-out;
			animation-name: hoverin;
		}
	}
	h3 {
		font-size: 18px;
		margin-bottom: 10px;
		.icon {
			line-height: 2;
			display: inline-block;
			opacity: 0.5;
			transform: scale(2);
			margin: 0 15px;
		}
	}
	.explainer {
		text-align: center;
	}
	&.active {
		animation-duration: 0.75s;
		animation-name: slidein;
		animation-timing-function: ease;
		display: flex;
		opacity: 1;
		.body {
			pointer-events: auto;
		}
		z-index: 10;
	}
	&.ease-down {
		animation-duration: 2s;
		animation-timing-function: ease-out;
		animation-name: easedown;
	}
	&.last-active {
		animation-duration: 0.25s;
		animation-name: slideout;
		animation-timing-function: ease;
		animation-fill-mode: forwards;
		display: flex;
	}

	@keyframes easedown {
		from {
			transform: translateY(-30px);
		}
		75% {
			transform: translateY(-30px);
		}
		to {
			transform: translateY(0);
		}
	}

	@keyframes hoverin {
		from {
			transform: scale(400) translateY(15vh);
			opacity: 0;
		}

		75% {
			opacity: 0.1;
		}

		to {
			transform: scale(5) translateY(0);
			opacity: 0.5;
		}
	}

	@keyframes slideout {
		from {
			opacity: 1;
			height: auto;
		}
		99% {
			opacity: 0;
			height: auto;
			transform: scale(0.9);
		}
		to {
			opacity: 0;
			height: 0px;
			transform: scale(0.09);
		}
	}
	@keyframes slidein {
		from {
			opacity: 0;
			transform: scale(1);
		}
		50% {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
`;

export const ButtonRow = styled.div`
	margin-top: 10px;
	flex-wrap: wrap;
	justify-content: flex-start;
	white-space: normal; // required for wrap
	button {
		margin: 10px 10px 0 0;
	}
`;

const LinkRow = styled.div`
	margin-top: 20px;
	display: flex;
	align-items: center;
	button {
		margin-left: auto;
	}
	a {
		text-decoration: none;
	}
`;

const CenterRow = styled.div`
	margin-top: 20px;
	text-align: center;
`;

const Dots = styled.div`
	display: flex;
	position: absolute;
	top: calc(100vh - 30px);
	left: calc(50vw - ${STEPS.length * 10}px);
	z-index: 11;
`;

const Dot = styled.div<{ selected?: boolean }>`
	width: 10px;
	height: 10px;
	border-radius: 5px;
	margin: 0 5px;
	background: var(--text-color-highlight);
	opacity: ${props => (props.selected ? "1" : "0.2")};
	transition: opacity 0.25s;
`;

const OutlineBox = styled.div`
	width: 100%;
	border: 1px solid var(--base-border-color);
	padding: 50px 0;
`;

const DialogRow = styled.div`
	display: flex;
	padding: 10px 0;
	&:first-child {
		margin-top: -10px;
	}
	.icon {
		color: var(--text-color-info);
		margin-right: 15px;
		flex-shrink: 0;
		flex-grow: 0;
	}
`;

const SkipLink = styled.div`
	cursor: pointer;
	text-align: center;
	margin-top: 30px;
	color: var(--text-color-subtle);
	opacity: 0.75;
	&:hover {
		opacity: 1;
		color: var(--text-color);
	}
`;

const Keybinding = styled.div`
	margin: 40px 0;
	text-align: center;
	transform: scale(2);
`;

const Sep = styled.div`
	border-top: 1px solid var(--base-border-color);
	margin: 10px -20px 20px -20px;
`;

const OutlineNumber = styled.div`
	display: flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: center;
	font-size: 14px;
	width: 30px;
	height: 30px;
	border-radius: 50%;
	margin: 0 10px 0 0;
	font-weight: bold;

	background: var(--button-background-color);
	color: var(--button-foreground-color);
`;

export const Onboard = React.memo(function Onboard() {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const { providers } = state;
		const team = state.teams[state.context.currentTeamId];
		const dontSuggestInvitees = team.settings ? team.settings.dontSuggestInvitees || {} : {};

		const connectedProviders = Object.keys(providers).filter(id => isConnected(state, { id }));
		const codeHostProviders = Object.keys(providers).filter(id =>
			[
				"github",
				"github_enterprise",
				"bitbucket",
				"bitbucket_server",
				"gitlab",
				"gitlab_enterprise"
			].includes(providers[id].name)
		);
		const issueProviders = Object.keys(providers)
			.filter(id => providers[id].hasIssues)
			.filter(id => !codeHostProviders.includes(id));
		const messagingProviders = Object.keys(providers).filter(id => providers[id].hasSharing);

		return {
			providers: state.providers,
			dontSuggestInvitees,
			connectedProviders,
			codeHostProviders,
			issueProviders,
			messagingProviders,
			teamMates: getTeamMates(state)
		};
	}, shallowEqual);
	const { providers } = derivedState;
	const [currentStep, setCurrentStep] = React.useState(0);
	const [lastStep, setLastStep] = React.useState(0);
	const [suggestedInvitees, setSuggestedInvitees] = React.useState<any[]>([]);
	const [seenCommentingStep, setSeenCommentingStep] = React.useState<boolean>(false);

	useDidMount(() => {
		getSuggestedInvitees();
	});

	const getSuggestedInvitees = async () => {
		const result = await HostApi.instance.send(GetLatestCommittersRequestType, {});
		const committers = result ? result.scm : undefined;
		if (!committers) return;

		const { teamMates, dontSuggestInvitees } = derivedState;
		const suggested: any[] = [];
		Object.keys(committers).forEach(email => {
			if (teamMates.find(user => user.email === email)) return;
			if (dontSuggestInvitees[email.replace(/\./g, "*")]) return;
			suggested.push({ email, fullName: committers[email] || email });
		});
		setSuggestedInvitees(suggested);
	};

	const confirmSkip = () => {
		confirmPopup({
			title: "Skip this step?",
			className: "wide",
			message:
				"CodeStream is more powerful when you collaborate. You can invite team members at any time, but don’t hoard all the fun.",
			centered: false,
			buttons: [
				{ label: "Go Back", className: "control-button" },
				{
					label: "Skip Step",
					action: () => skip(),
					className: "secondary"
				}
			]
		});
	};

	const skip = () => setStep(currentStep + 1);

	const setStep = (step: number) => {
		if (step === 6) {
			dispatch(closePanel());
			return;
		}
		if (step === 5) setSeenCommentingStep(true);
		setLastStep(currentStep);
		setCurrentStep(step);
		requestAnimationFrame(() => {
			const $container = document.getElementById("scroll-container");
			if ($container) $container.scrollTo({ top: 0, behavior: "smooth" });
			const $active = document.getElementsByClassName("active")[0];
			if ($active) {
				const $dots = document.getElementById("dots");
				if ($dots) $dots.style.top = `${$active.clientHeight - 30}px`;
			}
		});
	};

	const renderProviderButtons = providerIds => {
		return providerIds.map(providerId => {
			const provider = providers[providerId];
			const providerDisplay = PROVIDER_MAPPINGS[provider.name];
			const connected = derivedState.connectedProviders.includes(providerId);
			if (providerDisplay) {
				return (
					<Provider
						key={provider.id}
						variant={connected ? "success" : undefined}
						onClick={() =>
							!connected && dispatch(configureAndConnectProvider(provider.id, "Onboard"))
						}
					>
						<Icon name={providerDisplay.icon} />
						{providerDisplay.displayName}
					</Provider>
				);
			} else return null;
		});
	};

	const className = (step: number) => {
		if (step === currentStep) return "active";
		if (step === lastStep) return "last-active";
		return "";
	};

	return (
		<div
			id="scroll-container"
			className="onboarding-page"
			style={{
				position: "relative",
				alignItems: "center",
				overflowX: "hidden",
				overflowY: currentStep === 0 ? "hidden" : "auto"
			}}
		>
			{seenCommentingStep && <CreateCodemarkIcons />}
			<form className="standard-form" style={{ height: "auto", position: "relative" }}>
				<fieldset className="form-body">
					<div style={{ position: "absolute", top: "10px", right: "10px", zIndex: 15 }}>
						<CancelButton onClick={() => dispatch(closePanel())} />
					</div>
					<Step className={`ease-down ${className(0)}`}>
						<div className="body">
							<h1>
								<Icon name="codestream" />
								<br />
								Welcome to CodeStream
							</h1>
							<p className="explainer">
								CodeStream helps you discuss, review, and understand code.
							</p>
							<CenterRow>
								<Button size="xl" onClick={() => setStep(1)}>
									Get Started
								</Button>
							</CenterRow>
						</div>
					</Step>

					<Step className={className(1)}>
						<div className="body">
							<h3>
								<Icon name="mark-github" />
								<Icon name="gitlab" />
								<Icon name="bitbucket" />
								<br />
								Connect to your Code Host
							</h3>
							<p className="explainer">
								Bring pull requests into your IDE to streamline your workflow
							</p>
							<Dialog>
								<DialogRow>
									<Icon name="check" />
									<div>Rich create pull request interface w/diff tool</div>
								</DialogRow>
								<DialogRow>
									<Icon name="check" />
									<div>
										Visualize code comments from merged-in pull requests as annotations on your
										source files
									</div>
								</DialogRow>
								<DialogRow>
									<Icon name="check" />
									<div>
										Manage pull requests and conduct code reviews with full source-tree context
										(GitHub only)
									</div>
								</DialogRow>
								<Sep />
								<IntegrationButtons noBorder noPadding>
									{renderProviderButtons(derivedState.codeHostProviders)}
								</IntegrationButtons>
							</Dialog>
							<SkipLink onClick={skip}>I'll do this later</SkipLink>
						</div>
					</Step>
					<Step className={className(2)}>
						<div className="body">
							<h3>
								<Icon name="jira" />
								<Icon name="trello" />
								<Icon name="asana" />
								<br />
								Connect to your Issue Tracker
							</h3>
							<p className="explainer">Grab tickets and get to work without breaking flow</p>
							<Dialog>
								<DialogRow>
									<Icon name="check" />
									<div>View a list of outstanding tasks assigned to you with custom queries</div>
								</DialogRow>
								<DialogRow>
									<Icon name="check" />
									<div>
										One-click to update task status, create a branch, and update your status on
										Slack
									</div>
								</DialogRow>
								<DialogRow>
									<Icon name="check" />
									<div>
										Enrich the context of code discussion, pull requests, and feedback requests by
										including ticket information
									</div>
								</DialogRow>
								<Sep />
								<IntegrationButtons noBorder noPadding>
									{renderProviderButtons(derivedState.issueProviders)}
								</IntegrationButtons>
							</Dialog>
							<SkipLink onClick={skip}>I'll do this later</SkipLink>
						</div>
					</Step>
					<Step className={className(3)}>
						<div className="body">
							<h3>
								<Icon name="slack" />
								<Icon name="msteams" />
								<br />
								Connect to Slack or MS Teams
							</h3>
							<p className="explainer">
								Ask questions or make suggestions about any code in your repo
							</p>
							<Dialog>
								<DialogRow>
									<Icon name="check" />
									<div>
										Discussing code is as simple as: select the code, type your question, and share
										to a channel or DM
									</div>
								</DialogRow>
								<DialogRow>
									<Icon name="check" />
									<div>Code authors are automatically at-mentioned based on git blame info</div>
								</DialogRow>
								<DialogRow>
									<Icon name="check" />
									<div>
										Conversation threads are tied to code locations across branches and as new code
										merges in
									</div>
								</DialogRow>
								<Sep />
								<IntegrationButtons noBorder noPadding>
									{renderProviderButtons([...derivedState.messagingProviders].reverse())}
								</IntegrationButtons>
							</Dialog>
							<SkipLink onClick={skip}>I'll do this later</SkipLink>
						</div>
					</Step>
					<Step className={className(4)}>
						<div className="body">
							<h3>Invite your team</h3>
							<p className="explainer">We recommend exploring CodeStream with your team </p>
							<Dialog>
								{suggestedInvitees.length > 0 && (
									<>
										<p className="explainer" style={{ textAlign: "left" }}>
											Suggestions below are based on your git history
										</p>
										{suggestedInvitees.map(user => {
											return (
												<Checkbox name={user.email} onChange={() => {}}>
													{user.fullName}{" "}
													<CSText as="span" muted>
														{user.email}
													</CSText>
												</Checkbox>
											);
										})}
									</>
								)}
								<LinkRow>
									<Link>+ Add more</Link>
									<Button>Send invites</Button>
								</LinkRow>
							</Dialog>
							<SkipLink onClick={confirmSkip}>I'll do this later</SkipLink>
						</div>
					</Step>
					<Step className={className(5)}>
						<div className="body">
							<h3>Try it: Discuss Code with your Team</h3>
							<div style={{ height: "5px" }} />
							<Dialog>
								<DialogRow style={{ alignItems: "center" }}>
									<OutlineNumber>1</OutlineNumber>
									<div>Select a range in your editor</div>
								</DialogRow>
								<DialogRow style={{ alignItems: "center" }}>
									<OutlineNumber>2</OutlineNumber>
									<div>Click the comment icon or press the keybinding:</div>
								</DialogRow>
								<Keybinding>{ComposeKeybindings.comment}</Keybinding>
							</Dialog>
							<SkipLink onClick={skip}>I'll try this later</SkipLink>
						</div>
					</Step>
				</fieldset>
			</form>
			<Dots id="dots">
				{STEPS.map((step, index) => {
					const selected = index === currentStep;
					return <Dot selected={selected} onClick={() => setStep(index)} />;
				})}
			</Dots>
		</div>
	);
});
