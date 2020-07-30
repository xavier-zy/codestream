import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { CodeStreamState } from "../store";
import { Button } from "../src/components/Button";
import styled from "styled-components";
import { CSMe } from "@codestream/protocols/api";
import { isFeatureEnabled } from "../store/apiVersioning/reducer";
import { CreateCodemarkIcons } from "./CreateCodemarkIcons";
import ScrollBox from "./ScrollBox";
import Icon from "./Icon";
import { Tabs, Tab } from "../src/components/Tabs";
import Timestamp from "./Timestamp";
import copy from "copy-to-clipboard";
import MessageInput from "./MessageInput";
import Tooltip from "./Tooltip";
import { Card } from "../src/components/Card";
import { Headshot, PRHeadshot } from "../src/components/Headshot";
import { MarkdownText } from "./MarkdownText";
import { Link } from "./Link";
import { HeadshotName } from "../src/components/HeadshotName";
import Tag from "./Tag";
import { setCurrentReview, setCurrentPullRequest } from "../store/context/actions";
import CancelButton from "./CancelButton";
import { useDidMount } from "../utilities/hooks";
import { HostApi } from "../webview-api";
import { RequestType } from "../vscode-jsonrpc.shim";
import {
	CloseAndCreatePullRequestCommentRequest as CreatePullRequestCommentAndCloseRequest,
	CreatePullRequestCommentRequest,
	ExecuteThirdPartyTypedRequest,
	FetchThirdPartyPullRequestPullRequest,
	ExecuteThirdPartyTypedType,
	FetchThirdPartyPullRequestRequestType,
	FetchThirdPartyPullRequestResponse,
	MergeMethod,
	MergePullRequestRequest
} from "@codestream/protocols/agent";
import { markdownify } from "./Markdowner";

// const pr = {
// 	title: "Improve Jira Integration",
// 	url: "https://github.com/TeamCodeStream/codestream/pull/225",
// 	number: 23,
// 	status: "merged",
// 	createdAt: 1595990978000,
// 	author: "pez",
// 	numConversations: 3,
// 	numCommits: 7,
// 	numChecks: 12,
// 	numFilesChanged: 3,
// 	numActionCommits: 7,
// 	sourceBranch: "feature/LR3KD2Lj",
// 	destinationBranch: "develop",
// 	linesAdded: 12,
// 	linesDeleted: 13,
// 	conversation: [
// 		{
// 			type: "description",
// 			author: "pez",
// 			createdAt: 1595990878000,
// 			body: "to fix this jira integration we will have to work hard"
// 		},
// 		{
// 			type: "activity",
// 			author: "pez",
// 			createdAt: 1595990878000,
// 			body: "to fix this jira integration we will have to work hard"
// 		},
// 		{
// 			type: "commit",
// 			sha: "0205864ade43a6b6c734301a01906cebb8469f3b",
// 			createdAt: 1595990878000,
// 			author: "pez",
// 			shortMessage:
// 				"https://trello.com/c/xHJqoAz0/4251-need-to-strip-illegal-characters-out-of-branch-name"
// 		},
// 		{
// 			type: "commit",
// 			sha: "f0666774fe742e9d0499a7621c990024d75c289f",
// 			createdAt: 1595990868000,
// 			author: "pez",
// 			shortMessage: "show 0 results if your test query has no results"
// 		},
// 		{
// 			type: "comment",
// 			author: "pez",
// 			createdAt: 1595990978000,
// 			body: "this is a test comment"
// 		},
// 		{
// 			type: "foot"
// 		},
// 		{
// 			type: "system",
// 			body:
// 				"Add more commits by pushing to the `feature/ZX3nEHk5-improve-jira-issue-inte` branch on `TeamCodeStream/codestream`."
// 		}
// 	]
// };

const Root = styled.div`
	${Tab} {
		font-size: 13px;
		.icon {
			// vertical-align: -2px;
			display: inline-block;
			margin: 0 5px;
		}
	}
	@media only screen and (max-width: 700px) {
		.wide-text {
			display: none;
		}
	}
`;

const PRHeader = styled.div`
	margin: 20px 20px 0 20px;
`;

const PRTitle = styled.div`
	font-size: 20px;
	span {
		opacity: 0.5;
	}
	a {
		color: var(--text-color);
		opacity: 0.5;
		text-decoration: none;
		&:hover {
			color: var(--text-color-info);
			opacity: 1;
		}
	}
	.cancel-button {
		position: absolute;
		top: 20px;
		right: 20px;
		opacity: 1;
	}
`;

const PRStatus = styled.div`
	display: flex;
	width: 100%;
	justify-content: center;
	align-items: center;
	margin: 10px 0 20px 0;
`;

const PRStatusButton = styled(Button)`
	flex-grow: 0;
	border-radius: 15px;
	margin-right: 10px;
	padding-left: 12px;
	padding-right: 12px;
	.icon {
		margin-right: 5px;
	}
	text-transform: capitalize;
	white-space: nowrap;
`;

const PRStatusMessage = styled.div`
	flex-grow: 10;
`;

const PRAuthor = styled.span`
	font-weight: bold;
	padding-right: 5px;
	color: var(--text-color-highlight);
`;

const PRBranch = styled.span`
	display: inline-block;
	font-family: Menlo, Consolas, "DejaVu Sans Mono", monospace;
	color: var(--text-color-highlight);
`;

const PRAction = styled.span`
	color: var(--text-color-subtle);
`;

const PRBadge = styled.span`
	display: inline-block;
	background: rgba(127, 127, 127, 0.25);
	border-radius: 9px;
	padding: 0 5px;
	min-width: 18px;
	text-align: center;
	margin: 0 5px;
`;

const PRPlusMinus = styled.div`
	float: right;
	margin-left: auto;
	font-size: smaller;
	.added {
		white-space: nowrap;
		padding-left: 5px;
		color: #66aa66;
	}
	.deleted {
		white-space: nowrap;
		padding-left: 5px;
		color: #cc3366;
	}
`;

const PRContent = styled.div`
	margin: 0 20px 20px 20px;
	display: flex;
	// width: 100%;
	.main-content {
		flex-grow: 10;
	}
	@media only screen and (max-width: 630px) {
		flex-direction: column;
		.main-content {
			order: 2;
		}
	}
`;

const PRSection = styled.div`
	padding: 10px 0;
	position: relative;
	border-bottom: 1px solid var(--base-border-color);
	.icon {
		float: right;
		display: inline-block;
		transform: scale(0.7);
		opacity: 0.7;
	}
`;

const PRSidebar = styled.div`
	flex-grow: 0;
	display: flex;
	flex-direction: column;
	@media only screen and (max-width: 630px) {
		flex-direction: row;
		flex-wrap: wrap;
		width: auto;
		order: 1;
		margin-left: 0;
		margin-right: -10px;
		padding-left: 0;
		padding-top: 0;
		${PRSection} {
			flex: 1 0 0;
			width: 1fr;
			min-width: 150px;
			margin: 0 10px 10px 0;
			border: 1px solid var(--base-border-color);
			padding: 5px;
		}
	}
	width: 225px;
	padding-left: 20px;
`;

const PRComment = styled.div`
	margin: 30px 0;
	position: relative;
	${PRHeadshot}, ${Headshot} {
		position: absolute;
		left: 0;
		top: 0;
		// div,
		// img {
		// 	border-radius: 50%;
		// }
	}
`;

const PRCommentCard = styled.div`
	border: 1px solid var(--base-border-color);
	background: var(--base-background-color);
	padding: 10px;
	margin-left: 60px;
	z-index: 2;
	&:before {
		z-index: 5;
		content: "";
		position: absolute;
		left: 55px;
		top: 15px;
		width: 10px;
		height: 10px;
		transform: rotate(45deg);
		border-left: 1px solid var(--base-border-color);
		border-bottom: 1px solid var(--base-border-color);
		background: var(--base-background-color);
	}
`;

const PRCommentHeader = styled.div`
	padding: 0 10px 10px 10px;
	margin: 0 -10px;
	border-bottom: 1px solid var(--base-border-color);
	display: flex;
`;

const PRCommentBody = styled.div`
	padding: 15px 0 5px 0;
`;

// const PRCard = styled.div`
// 	border: 1px solid var(--base-border-color);
// 	background: var(--base-background-color);
// 	margin-left: 60px;
// 	padding: 15px 10px;
// `;

const PRStatusIcon = styled.div`
	.icon {
		flex-shrink: 0;
		margin: 0 10px;
	}
`;

const PRCommit = styled.div`
	position: relative;
	display: flex;
	margin: 10px 0;
	padding-left: 65px;
	${PRHeadshot} {
		flex-shrink: 0;
		margin: 0 10px;
		// div,
		// img {
		// 	border-radius: 50%;
		// }
	}

	.sha {
		margin-left: auto;
	}
	.icon {
		background: var(--app-background-color);
		opacity: 0.7;
		height: 16px;
	}
`;

const ButtonRow = styled.div`
	display: flex;
	button + button {
		margin-left: 10px;
	}
	button {
		margin-top: 10px;
	}
`;

const PRConversation = styled.div`
	position: relative;

	&:before {
		content: "";
		position: absolute;
		left: 71px;
		z-index: 0;
		top: 0;
		height: 100%;
		width: 2px;
		background: var(--base-border-color);
	}
`;

const PRFoot = styled.div`
	border-top: 2px solid var(--base-border-color);
	background: var(--app-background-color);
	margin-top: 30px;
`;

const PRActionIcons = styled.div`
	margin-left: auto;
	display: flex;
	.member {
		border: 1px solid var(--base-border-color);
		border-radius: 10px;
		padding: 1px 7px;
		font-size: smaller;
		color: var(--text-color-subtle);
	}
	.icon {
		opacity: 0.5;
		margin-left: 10px;
	}
`;

// const PRSystem = styled.div`
// 	position: relative;
// 	padding: 20px 0 0 0;
// 	margin-left: 60px;
// 	background: var(--app-background-color);
// 	z-index: 3;
// `;

export const PullRequest = () => {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const currentUser = state.users[state.session.userId!] as CSMe;
		const team = state.teams[state.context.currentTeamId];
		const blameMap = team.settings ? team.settings.blameMap : {};
		const skipGitEmailCheck = state.preferences.skipGitEmailCheck;
		const addBlameMapEnabled = isFeatureEnabled(state, "addBlameMap");

		return {
			currentUser,
			currentPullRequestId: state.context.currentPullRequestId,
			blameMap,
			team,
			skipGitEmailCheck,
			addBlameMapEnabled
		};
	});

	const [text, setText] = useState("");
	const [activeTab, setActiveTab] = useState(1);
	const [scmEmail, setScmEmail] = useState("");
	const [ghRepo, setGhRepo] = useState<any>({});

	const [pr, setPr] = useState<FetchThirdPartyPullRequestPullRequest>({
		author: {},
		files: {},
		commits: {}
	} as any);

	const submit = () => {};

	const { team, currentUser, skipGitEmailCheck, addBlameMapEnabled, blameMap = {} } = derivedState;

	const mappedMe = blameMap[scmEmail.replace(/\./g, "*")];

	const statusIcon = "git-merge";

	const action = pr.merged ? "merged " : "wants to merge ";

	const exit = async () => {
		// FIXME
		await dispatch(setCurrentPullRequest());
	};

	const onCommentClick = async e => {
		await HostApi.instance.send(
			new ExecuteThirdPartyTypedType<CreatePullRequestCommentRequest, any>(),
			{
				method: "createPullRequestComment",
				providerId: "github*com",
				params: {
					pullRequestId: derivedState.currentPullRequestId!,
					text: text
				}
			}
		);
		setText("");
		fetch();
	};

	const onCommentAndCloseClick = async e => {
		await HostApi.instance.send(
			new ExecuteThirdPartyTypedType<CreatePullRequestCommentAndCloseRequest, any>(),
			{
				method: "createPullRequestCommentAndClose",
				providerId: "github*com",
				params: {
					pullRequestId: derivedState.currentPullRequestId!,
					text: text
				}
			}
		);
		setText("");
		fetch();
	};

	const fetch = async () => {
		const r = (await HostApi.instance.send(FetchThirdPartyPullRequestRequestType, {
			providerId: "github*com",
			pullRequestId: derivedState.currentPullRequestId!
		})) as FetchThirdPartyPullRequestResponse;
		setGhRepo(r.repository);
		setPr(r.repository.pullRequest);
	};

	useDidMount(() => {
		fetch();
	});

	const mergePullRequest = async (options: { mergeMethod: MergeMethod }) => {
		await HostApi.instance.send(
			new ExecuteThirdPartyTypedType<MergePullRequestRequest, boolean>(),
			{
				method: "mergePullRequest",
				providerId: "github*com",
				params: {
					pullRequestId: derivedState.currentPullRequestId!,
					mergeMethod: options.mergeMethod
				}
			}
		);
		fetch();
	};

	return (
		<Root className="panel full-height">
			<CreateCodemarkIcons narrow />
			<PRHeader>
				<PRTitle>
					{pr.title} <Link href={pr.url}>#{pr.number}</Link>
					<CancelButton onClick={exit} />
				</PRTitle>
				<PRStatus>
					<PRStatusButton>
						<Icon name={statusIcon} />
						{pr.state && pr.state.toLowerCase()}
					</PRStatusButton>
					<PRStatusMessage>
						<PRAuthor>{pr.author.login}</PRAuthor>
						<PRAction>
							{action} {pr.commits && pr.commits.totalCount} commits into{" "}
							<PRBranch>{pr.baseRefName}</PRBranch> from <PRBranch>{pr.headRefName}</PRBranch>
							<Icon
								title="Copy"
								placement="bottom"
								name="copy"
								className="clickable"
								onClick={e => copy(pr.baseRefName)}
							/>
						</PRAction>
						<Timestamp time={pr.createdAt} relative />
					</PRStatusMessage>
				</PRStatus>
				<Tabs style={{ marginTop: 0 }}>
					<Tab onClick={e => setActiveTab(1)} active={activeTab == 1}>
						<Icon name="comment" />
						<span className="wide-text">Conversation</span>
						<PRBadge>
							{pr.timelineItems && pr.timelineItems.nodes
								? pr.timelineItems.nodes.filter(
										_ => _.__typename && _.__typename.indexOf("Comment") > -1
								  ).length
								: 0}
						</PRBadge>
					</Tab>
					<Tab onClick={e => setActiveTab(2)} active={activeTab == 2}>
						<Icon name="git-commit" />
						<span className="wide-text">Commits</span>
						<PRBadge>{pr.commits.totalCount}</PRBadge>
					</Tab>
					{/*
					<Tab onClick={e => setActiveTab(3)} active={activeTab == 3}>
						<Icon name="check" />
						<span className="wide-text">Checks</span>
						<PRBadge>{pr.numChecks}</PRBadge>
					</Tab>
					 */}
					<Tab onClick={e => setActiveTab(4)} active={activeTab == 4}>
						<Icon name="plus-minus" />
						<span className="wide-text">Files Changed</span>
						<PRBadge>{pr.files.totalCount}</PRBadge>
					</Tab>
					{/* 
					<PRPlusMinus>
						<span className="added">+{pr.linesAdded}</span>{" "}
						<span className="deleted">-{pr.linesDeleted}</span>
					</PRPlusMinus>
					*/}
				</Tabs>
			</PRHeader>
			<ScrollBox>
				<div className="channel-list vscroll">
					<PRContent>
						<div className="main-content">
							<PRConversation>
								{/* in the GH data model, the top box is part of the pr, rather than the timeline */}
								<PRComment style={{ marginTop: "10px" }}>
									<PRHeadshot person={pr.author} size={40} />
									<PRCommentCard>
										<PRCommentHeader>
											<PRAuthor>{pr.author.login}</PRAuthor> commented{" "}
											<Timestamp time={pr.createdAt!} relative />
											<PRActionIcons>
												<div className="member">Member</div>
												<Icon name="smiley" />
												<Icon name="kebab-horizontal" />
											</PRActionIcons>
										</PRCommentHeader>
										<PRCommentBody
											dangerouslySetInnerHTML={{
												__html: markdownify(pr.body)
											}}
										></PRCommentBody>
									</PRCommentCard>
								</PRComment>
								{pr.timelineItems &&
									pr.timelineItems.nodes.map((item, index) => {
										switch (item.__typename) {
											// case "description":
											case "IssueComment":
												return (
													<PRComment key={index}>
														<PRHeadshot key={index} size={40} person={item.author} />
														<PRCommentCard>
															<PRCommentHeader>
																<PRAuthor>{item.author.login}</PRAuthor> commented{" "}
																<Timestamp time={item.createdAt!} relative />
																<PRActionIcons>
																	<div className="member">Member</div>
																	<Icon name="smiley" />
																	<Icon name="kebab-horizontal" />
																</PRActionIcons>
															</PRCommentHeader>
															<PRCommentBody>{item.bodyText}</PRCommentBody>
														</PRCommentCard>
													</PRComment>
												);
											case "PullRequestReview": {
												return (
													<PRComment key={index}>
														<PRHeadshot key={index} size={40} person={item.author} />
														<PRCommentCard>
															<PRCommentHeader>
																<PRAuthor>{item.author.login}</PRAuthor> commented{" "}
																<Timestamp time={item.createdAt!} relative />
																<PRActionIcons>
																	<div className="member">Member</div>
																	<Icon name="smiley" />
																	<Icon name="kebab-horizontal" />
																</PRActionIcons>
															</PRCommentHeader>
															<PRCommentBody>
																{item.bodyText}
																{item.comments &&
																	item.comments.nodes &&
																	item.comments.nodes.map((_, index2) => {
																		return (
																			<>
																				{_.diffHunk}
																				<br />
																				{_.bodyText}
																			</>
																		);
																	})}
															</PRCommentBody>
														</PRCommentCard>
													</PRComment>
												);
											}
											case "PullRequestCommit":
												return (
													<PRCommit key={index}>
														<Icon name="git-commit" />
														<PRHeadshot key={index} size={16} person={item.commit.author} />
														<div className="monospace ellipsis">
															<MarkdownText text={item.commit.message || ""} />
														</div>
														<div className="monospace sha">{item.commit.abbreviatedOid}</div>
													</PRCommit>
												);
											case "LabeledEvent":
												return null;
											case "UnlabeledEvent":
												return null;
											case "ReviewRequestedEvent":
												return null;
											case "RenamedTitleEvent":
												return null;
											case "MergedEvent":
												return null;
											// case "foot":
											// 	return <PRFoot />;
											// case "system":
											// 	return (
											// 		<PRSystem>
											// 			<MarkdownText text={item.body || ""} />
											// 		</PRSystem>
											// 	);
											default:
												return null;
										}
									})}
								<PRFoot />
							</PRConversation>
							<PRComment>
								{/* 
							<PRStatusIcon>
									<Icon name={statusIcon}  />
								</PRStatusIcon>
								*/}
								<PRCommentCard>
									{!pr.merged && pr.mergeable === "MERGEABLE" && pr.state !== "CLOSED" && (
										<div>
											<p>This branch has no conflicts with the base branch when rebasing</p>
											<p>Rebase and merge can be performed automatically.</p>
											<ButtonRow>
												<div style={{ textAlign: "left", flexGrow: 1 }}>
													<Tooltip
														title={
															<span>
																All commits from this branch will be added to the base branch via a
																merge commit.
																{!ghRepo.mergeCommitAllowed && (
																	<small>Not enabled for this repository</small>
																)}
															</span>
														}
														placement="bottomRight"
														delay={1}
													>
														<Button
															disabled={!ghRepo.mergeCommitAllowed}
															onClick={e => mergePullRequest({ mergeMethod: "MERGE" })}
														>
															Create a merge commit
														</Button>
													</Tooltip>
													<Button
														disabled={!ghRepo.squashMergeAllowed}
														onClick={e => mergePullRequest({ mergeMethod: "SQUASH" })}
													>
														Squash and merge
													</Button>
													<Button
														disabled={!ghRepo.rebaseMergeAllowed}
														onClick={e => mergePullRequest({ mergeMethod: "REBASE" })}
													>
														Rebase and merge
													</Button>
												</div>
											</ButtonRow>
										</div>
									)}
									{!pr.merged && pr.mergeable === "CONFLICTING" && (
										<div>This branch has conflicts that must be resolved</div>
									)}
									{!pr.merged && pr.mergeable === "UNKNOWN" && pr.state === "CLOSED" && (
										<div>This pull request is closed</div>
									)}
									{!pr.merged && pr.state === "CLOSED" && <div>Pull request is closed</div>}
									{pr.merged && <div>Pull request successfully merged and closed</div>}
								</PRCommentCard>
							</PRComment>
							<PRComment>
								<Headshot size={40} person={currentUser}></Headshot>
								<PRCommentCard>
									<div
										style={{ margin: "5px 0 0 0", border: "1px solid var(--base-border-color)" }}
									>
										<MessageInput
											multiCompose
											text={text}
											placeholder="Add Comment..."
											onChange={setText}
											onSubmit={submit}
										/>
									</div>
									<ButtonRow>
										<div style={{ textAlign: "right", flexGrow: 1 }}>
											<Button onClick={onCommentAndCloseClick}>Close and comment</Button>
											<Tooltip
												title={
													<span>
														Submit Comment
														<span className="keybinding extra-pad">
															{navigator.appVersion.includes("Macintosh") ? "⌘" : "Alt"} ENTER
														</span>
													</span>
												}
												placement="bottomRight"
												delay={1}
											>
												<Button onClick={onCommentClick}>Comment</Button>
											</Tooltip>
										</div>
									</ButtonRow>
								</PRCommentCard>
							</PRComment>
						</div>
						<PRSidebar>
							<PRSection>
								<Icon name="gear" className="settings clickable" onClick={() => {}} />
								Reviewers
								<br />
								<HeadshotName person={currentUser} />
							</PRSection>
							<PRSection>
								<Icon name="gear" className="settings clickable" onClick={() => {}} />
								Assignees
								<br />
								{pr &&
									pr.assignees &&
									pr.assignees.nodes.map((_: any) => <PRHeadshot person={_} size={16} />)}
							</PRSection>
							<PRSection>
								<Icon name="gear" className="settings clickable" onClick={() => {}} />
								Labels
								<br />
								{pr &&
									pr.labels &&
									pr.labels.nodes.map(_ => <Tag tag={{ label: _.name, color: _.color }} />)}
							</PRSection>
							<PRSection>
								Projects
								<Icon name="gear" className="settings clickable" onClick={() => {}} />
							</PRSection>
							<PRSection>
								Milestone
								<Icon name="gear" className="settings clickable" onClick={() => {}} />
								{pr && pr.milestone && <div>{pr.milestone.title}</div>}
							</PRSection>
							<PRSection>
								Linked Issues
								<Icon name="gear" className="settings clickable" onClick={() => {}} />
							</PRSection>
							<PRSection>
								Notifications
								<Icon name="gear" className="settings clickable" onClick={() => {}} />
							</PRSection>
							<PRSection>
								Participants
								<Icon name="gear" className="settings clickable" onClick={() => {}} />
								<br />
								{pr &&
									pr.participants &&
									pr.participants.nodes.map((_: any) => <PRHeadshot person={_} size={16} />)}
							</PRSection>
							<PRSection>
								Lock Convo
								<Icon name="lock" className="settings clickable" onClick={() => {}} />
							</PRSection>
						</PRSidebar>
					</PRContent>
				</div>
			</ScrollBox>
		</Root>
	);
};
