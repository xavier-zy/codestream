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
import { Headshot, PRHeadshot } from "../src/components/Headshot";
import { MarkdownText } from "./MarkdownText";
import { Link } from "./Link";
import { HeadshotName } from "../src/components/HeadshotName";
import Tag from "./Tag";
import { setCurrentReview, setCurrentPullRequest } from "../store/context/actions";
import CancelButton from "./CancelButton";
import { useDidMount } from "../utilities/hooks";
import { HostApi } from "../webview-api";
import {
	CreatePullRequestCommentAndCloseRequest,
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
import {
	PRHeader,
	PRTitle,
	PRStatus,
	PRStatusButton,
	PRStatusMessage,
	PRAuthor,
	PRAction,
	PRBranch,
	PRBadge,
	PRContent,
	PRConversation,
	PRComment,
	PRCommentCard,
	PRCommentHeader,
	PRActionIcons,
	PRCommentBody,
	PRCommit,
	PRFoot,
	PRSidebar,
	PRSection
} from "./PullRequestComponents";
import { ButtonRow } from "./StatusPanel";
import { PullRequestTimelineItems } from "./PullRequestTimelineItems";

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
	const [ghRepo, setGhRepo] = useState<any>({});

	const [pr, setPr] = useState<FetchThirdPartyPullRequestPullRequest>({
		author: {},
		files: {},
		commits: {}
	} as any);
	const { team, currentUser } = derivedState;
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
								<PullRequestTimelineItems pr={pr} />
								<PRFoot />
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
