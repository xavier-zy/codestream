import React, { useState, useEffect, useMemo } from "react";
import { shallowEqual, useDispatch, useSelector } from "react-redux";
import styled from "styled-components";
import { CodeStreamState } from "../store";
import { getTeamMates } from "../store/users/reducer";
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
import { ComposeKeybindings } from "./ComposeTitles";
import { CreateCodemarkIcons } from "./CreateCodemarkIcons";
import { isConnected } from "../store/providers/reducer";
import { TextInput } from "../Authentication/TextInput";
import { Tab, Tabs } from "../src/components/Tabs";

export const NUM_STEPS = 6;

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
		padding: 30px 20px 20px 20px;
		margin-bottom: 30px;
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
			animation-fill-mode: forwards;
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
		overflow: hidden;
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

const Dots = styled.div<{ steps: number }>`
	display: flex;
	position: absolute;
	top: calc(100vh - 30px);
	left: calc(50vw - ${props => props.steps * 10}px);
	z-index: 11;
	transition: top 0.15s;
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
	margin: 20px 0;
	text-align: center;
	transform: scale(1.5);
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

const ExpandingText = styled.div`
	margin: 10px 0;

	animation-duration: 0.25s;
	animation-name: expand;
	animation-timing-function: ease;
	animation-fill-mode: forwards;

	@keyframes expand {
		from {
			height: 0px;
		}
		to {
			height: 25px;
		}
	}
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
		const connectedCodeHostProviders = codeHostProviders.filter(id =>
			connectedProviders.includes(id)
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
			connectedCodeHostProviders,
			issueProviders,
			messagingProviders,
			teamMates: getTeamMates(state)
		};
	}, shallowEqual);

	const { providers } = derivedState;
	const [currentStep, setCurrentStep] = useState(0);
	const [lastStep, setLastStep] = useState(0);
	const [suggestedInvitees, setSuggestedInvitees] = useState<any[]>([]);
	const [seenCommentingStep, setSeenCommentingStep] = useState<boolean>(false);
	const [hasConnectedCodeHost, setHasConnectedCodeHost] = useState(
		derivedState.connectedCodeHostProviders.length > 0
	);
	const [numInviteFields, setNumInviteFields] = useState(0);

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
		if (suggested.length === 0) setNumInviteFields(3);
	};

	const confirmSkip = () => {
		confirmPopup({
			title: "Skip this step?",
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
		if (step === 1 && hasConnectedCodeHost) step = 2;
		if (step === NUM_STEPS) {
			dispatch(closePanel());
			return;
		}
		if (step === 5) setSeenCommentingStep(true);
		setLastStep(currentStep);
		setCurrentStep(step);
		scrollToTop();
		setTimeout(() => positionDots(), 250);
	};

	const scrollToTop = () => {
		requestAnimationFrame(() => {
			const $container = document.getElementById("scroll-container");
			if ($container) $container.scrollTo({ top: 0, behavior: "smooth" });
		});
	};

	const positionDots = () => {
		requestAnimationFrame(() => {
			const $active = document.getElementsByClassName("active")[0];
			if ($active) {
				const $dots = document.getElementById("dots");
				if ($dots) $dots.style.top = `${$active.clientHeight - 30}px`;
			}
		});
	};

	const addInvite = () => {
		setNumInviteFields(numInviteFields + 1);
		setTimeout(() => positionDots(), 250);
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
							<p className="explainer">We recommend exploring CodeStream with your team</p>
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
								{[...Array(numInviteFields)].map((_, index) => {
									return (
										<ExpandingText>
											<TextInput
												autoFocus={index === numInviteFields - 1}
												placeholder="name@example.com"
												value=""
												onChange={() => {}}
											/>
										</ExpandingText>
									);
								})}
								<LinkRow>
									<Link onClick={addInvite}>+ Add more</Link>
									<Button>Send invites</Button>
								</LinkRow>
							</Dialog>
							<SkipLink onClick={confirmSkip}>I'll do this later</SkipLink>
						</div>
					</Step>
					{/* 
					<Step className={className(5)}>
						<div className="body">
							<h3>Learn the basics</h3>
							<p className="explainer">
								Watch a few sample videos to get the most out of CodeStream
							</p>
							<Tabs>
								<Tab active>Pull Requests</Tab>
								<Tab>Feedback Requests</Tab>
							</Tabs>
							<img src="https://images.codestream.com/video/PullRequests.gif" />
							<SkipLink onClick={skip}>I'll do this later</SkipLink>
						</div>
					</Step>
					*/}
					<Step className={className(5)}>
						<div className="body">
							<h3>Discuss any code, anytime</h3>
							<p className="explainer">
								Discuss code in a pull request, a feedback request, or to ask a question or make a
								suggestion about any part of your code base.
							</p>
							<Dialog>
								<div
									style={{
										textAlign: "center",
										margin: "0 0 10px 0",
										fontSize: "larger",
										color: "var(--text-color-highlight)"
									}}
								>
									Try sharing a code comment with your team:
								</div>
								<DialogRow style={{ alignItems: "center" }}>
									<OutlineNumber>1</OutlineNumber>
									<div>Select a range in your editor</div>
								</DialogRow>
								<DialogRow style={{ alignItems: "center" }}>
									<OutlineNumber>2</OutlineNumber>
									<div>Click the comment icon or type the keybinding:</div>
								</DialogRow>
								<Keybinding>{ComposeKeybindings.comment}</Keybinding>
							</Dialog>
							<SkipLink onClick={skip}>I'll try this later</SkipLink>
						</div>
					</Step>
				</fieldset>
			</form>
			<Dots id="dots" steps={hasConnectedCodeHost ? NUM_STEPS - 1 : NUM_STEPS}>
				{[...Array(NUM_STEPS)].map((_, index) => {
					const selected = index === currentStep;
					if (index === 1 && hasConnectedCodeHost) return null;
					return <Dot selected={selected} onClick={() => setStep(index)} />;
				})}
			</Dots>
		</div>
	);
});

/* TODO
   add more input fields to invite
   make invites work
   handle what happens when you connect a code host
   after you create a codemark, what happens?
   hook it up to registration, remove from ellipsis menu
   A/B testing methodology
   instrumentation
 x center the dots when there are one fewer
 x what happens when there are no suggested invitees? (3 input fields)
*/
