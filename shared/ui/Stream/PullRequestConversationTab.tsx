import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { CodeStreamState } from "../store";
import { Button } from "../src/components/Button";
import { CSMe } from "@codestream/protocols/api";
import { isFeatureEnabled } from "../store/apiVersioning/reducer";
import Icon from "./Icon";
import Timestamp from "./Timestamp";
import MessageInput from "./MessageInput";
import Tooltip from "./Tooltip";
import { Headshot, PRHeadshot } from "../src/components/Headshot";
import { PRHeadshotName } from "../src/components/HeadshotName";
import Tag from "./Tag";
import { HostApi } from "../webview-api";
import {
	CreatePullRequestCommentAndCloseRequest,
	CreatePullRequestCommentRequest,
	ExecuteThirdPartyTypedType,
	MergeMethod,
	MergePullRequestRequest
} from "@codestream/protocols/agent";
import { markdownify } from "./Markdowner";
import {
	PRAuthor,
	PRContent,
	PRConversation,
	PRComment,
	PRCommentCard,
	PRCommentHeader,
	PRActionIcons,
	PRCommentBody,
	PRStatusHeadshot,
	PRIconButton,
	PRFoot,
	PRSidebar,
	PRButtonRow,
	PRSection,
	PRBranch
} from "./PullRequestComponents";
import { ButtonRow } from "./StatusPanel";
import { PullRequestTimelineItems } from "./PullRequestTimelineItems";
import { DropdownButton } from "./Review/DropdownButton";
import { InlineMenu } from "../src/components/controls/InlineMenu";
import { LoadingMessage } from "../src/components/LoadingMessage";
import styled from "styled-components";

const Circle = styled.div`
	width: 12px;
	height: 12px;
	border-radius: 6px;
	display: inline-block;
	margin-right: 5px;
	vertical-align: -1px;
`;

export const PullRequestConversationTab = props => {
	const { pr, ghRepo } = props;
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
	const [availableLabels, setAvailableLabels] = useState([]);
	const [availableReviewers, setAvailableReviewers] = useState([]);
	const [availableAssignees, setAvailableAssignees] = useState([]);
	const [isLoadingComment, setIsLoadingComment] = useState(false);
	const [isLoadingCommentAndClose, setIsLoadingCommentAndClose] = useState(false);

	const onCommentClick = async e => {
		setIsLoadingComment(true);
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
		props.fetch().then(() => setIsLoadingComment(false));
	};

	const onCommentAndCloseClick = async e => {
		setIsLoadingCommentAndClose(true);
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
		props.fetch();
	};

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
		props.fetch();
	};

	const numParticpants = ((pr.participants && pr.participants.nodes) || []).length;
	const participantsLabel = `${numParticpants} Participant${numParticpants == 1 ? "" : "s"}`;

	var reviewersHash: any = {};
	// the list of reviewers isn't in a single spot...
	pr.reviewRequests &&
		pr.reviewRequests.nodes.reduce((map, obj) => {
			map[obj.requestedReviewer.login] = obj.requestedReviewer.avatarUrl;
			return map;
		}, reviewersHash);
	pr.reviews &&
		pr.reviews.nodes.reduce((map, obj) => {
			map[obj.author.login] = obj.author.avatarUrl;
			return map;
		}, reviewersHash);

	const reviewers = Object.keys(reviewersHash).map(key => {
		return { login: key, avatarUrl: reviewersHash[key] };
	}) as { login: string; avatarUrl: string }[];

	const fetchAvailableReviewers = async (e?) => {
		const reviewers = await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
			method: "getReviewers",
			providerId: "github*com",
			params: {
				owner: ghRepo.repoOwner,
				repo: ghRepo.repoName
			}
		});
		setAvailableReviewers(reviewers);
	};

	const reviewerMenuItems = React.useMemo(() => {
		const reviewerIds = reviewers.map(_ => _.login);
		if (availableReviewers && availableReviewers.length) {
			const menuItems = availableReviewers.map((_: any) => ({
				checked: reviewerIds.includes(_.login),
				label: <PRHeadshotName person={_} className="no-padding" />,
				subtle: _.name,
				searchLabel: `${_.login}:${_.name}`,
				key: _.id,
				action: () => toggleReviewer(_.id)
			})) as any;
			menuItems.unshift({ type: "search", placeholder: "Type or choose a name" });
			return menuItems;
		} else {
			return [{ label: <LoadingMessage>Loading Reviewers...</LoadingMessage>, noHover: true }];
		}
	}, [availableReviewers, pr]);

	const toggleReviewer = async id => {
		await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
			method: "addReviewerToPullRequest",
			providerId: "github*com",
			params: {
				owner: ghRepo.repoOwner,
				repo: ghRepo.repoName,
				pullRequestId: pr.number,
				reviewerId: id
			}
		});
		props.fetch();
	};

	const fetchAvailableAssignees = async (e?) => {
		const assignees = await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
			method: "getAssignees",
			providerId: "github*com",
			params: {
				owner: ghRepo.repoOwner,
				repo: ghRepo.repoName
			}
		});
		setAvailableAssignees(assignees);
	};

	const assigneeMenuItems = React.useMemo(() => {
		const assigneeIds = pr.assignees.nodes.map(_ => _.login);
		if (availableAssignees && availableAssignees.length) {
			const menuItems = (availableAssignees || []).map((_: any) => ({
				checked: assigneeIds.includes(_.login),
				label: <PRHeadshotName person={_} className="no-padding" />,
				subtle: _.name,
				searchLabel: `${_.login}:${_.name}`,
				key: _.id,
				action: () => toggleAssignee(_.id)
			})) as any;
			menuItems.unshift({ type: "search", placeholder: "Type or choose a name" });
			return menuItems;
		} else {
			return [{ label: <LoadingMessage>Loading Assignees...</LoadingMessage>, noHover: true }];
		}
	}, [availableAssignees, pr]);

	const toggleAssignee = async id => {
		await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
			method: "addAssigneeToPullRequest",
			providerId: "github*com",
			params: {
				owner: ghRepo.repoOwner,
				repo: ghRepo.repoName,
				pullRequestId: pr.number,
				assigneeId: id
			}
		});
		props.fetch();
	};

	const fetchAvailableLabels = async (e?) => {
		const labels = await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
			method: "getLabels",
			providerId: "github*com",
			params: {
				owner: ghRepo.repoOwner,
				repo: ghRepo.repoName
			}
		});
		setAvailableLabels(labels);
	};

	const labelMenuItems = React.useMemo(() => {
		if (availableLabels && availableLabels.length) {
			const existingLabelIds = pr.labels ? pr.labels.nodes.map(_ => _.id) : [];
			const menuItems = availableLabels.map((_: any) => ({
				checked: existingLabelIds.includes(_.id),
				label: (
					<>
						<Circle style={{ backgroundColor: `#${_.color}` }} />
						{_.name}
					</>
				),
				searchLabel: _.name,
				key: _.id,
				subtext: <div style={{ maxWidth: "250px", whiteSpace: "normal" }}>{_.description}</div>,
				action: () => toggleLabel(_.id)
			})) as any;
			menuItems.unshift({ type: "search", placeholder: "Filter labels" });
			return menuItems;
		} else {
			return [{ label: <LoadingMessage>Loading Labels...</LoadingMessage>, noHover: true }];
		}
	}, [availableLabels, pr]);

	const toggleLabel = async id => {
		await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
			method: "addLabelToPullRequest",
			providerId: "github*com",
			params: {
				owner: ghRepo.repoOwner,
				repo: ghRepo.repoName,
				pullRequestId: pr.number,
				labelId: id
			}
		});
		props.fetch();
	};

	let prBody = pr.body;
	return (
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
									__html: markdownify(prBody)
								}}
							></PRCommentBody>
						</PRCommentCard>
					</PRComment>
					<PullRequestTimelineItems pr={pr} />
					<PRFoot />
				</PRConversation>
				<PRComment>
					{/* 
<PRStatusIcon>
	<Icon name={statusIcon}  />
</PRStatusIcon>
*/}
					{!pr.merged && pr.mergeable === "MERGEABLE" && pr.state !== "CLOSED" && (
						<PRCommentCard className="green-border">
							<PRStatusHeadshot className="green-background">
								<Icon name="git-merge" />
							</PRStatusHeadshot>
							<div style={{ padding: "5px 0" }}>
								<div style={{ display: "flex" }}>
									<PRIconButton className="green-background">
										<Icon name="check" />
									</PRIconButton>
									<div style={{ marginLeft: "10px" }}>
										<h1>This branch has no conflicts with the base branch when rebasing</h1>
										<p>Rebase and merge can be performed automatically.</p>
									</div>
								</div>
								<PRButtonRow>
									{/*
						<Tooltip
							title={
								<span>
									All commits from this branch will be added to the base branch via
									a merge commit.
									{!ghRepo.mergeCommitAllowed && (
										<>
											<br />
											<small>Not enabled for this repository</small>
										</>
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
						*/}
									<DropdownButton
										items={[
											{
												icon: <Icon name="git-merge" />,
												label: "Create a merge commit",
												subtext: (
													<span>
														All commits from this branch will be added to
														<br />
														the base branch via a merge commit.
														{!ghRepo.mergeCommitAllowed && (
															<>
																<br />
																<small>Not enabled for this repository</small>
															</>
														)}
													</span>
												),
												disabled: !ghRepo.mergeCommitAllowed,
												action: () => mergePullRequest({ mergeMethod: "MERGE" })
											},
											{
												icon: <Icon name="git-merge" />,
												label: "Squash and merge",
												subtext: (
													<span>
														The commits from this branch will be combined
														<br />
														into one commit in the base branch.
													</span>
												),
												disabled: !ghRepo.squashMergeAllowed,
												action: () => mergePullRequest({ mergeMethod: "SQUASH" })
											},
											{
												icon: <Icon name="git-merge" />,
												label: "Rebase and merge",
												subtext: (
													<span>
														The commits from this branch will be rebased
														<br />
														and added to the base branch.
													</span>
												),
												disabled: !ghRepo.rebaseMergeAllowed,
												action: () => mergePullRequest({ mergeMethod: "REBASE" })
											}
										]}
										variant="success"
									>
										Rebase and merge
									</DropdownButton>
								</PRButtonRow>{" "}
							</div>
						</PRCommentCard>
					)}
					{!pr.merged && pr.mergeable === "CONFLICTING" && (
						<PRCommentCard>
							<PRStatusHeadshot className="gray-background">
								<Icon name="git-merge" />
							</PRStatusHeadshot>
							<div style={{ padding: "5px 0" }}>
								<div style={{ display: "flex" }}>
									<PRIconButton className="gray-background">
										<Icon name="alert" />
									</PRIconButton>
									<div style={{ marginLeft: "10px" }}>
										<h1>This branch has conflicts that must be resolved</h1>
									</div>
								</div>
							</div>
						</PRCommentCard>
					)}
					{!pr.merged && pr.mergeable === "UNKNOWN" && pr.state === "CLOSED" && (
						<PRCommentCard className="red">
							<div>This pull request is closed</div>
						</PRCommentCard>
					)}
					{!pr.merged && pr.state === "CLOSED" && <div>Pull request is closed</div>}
					{pr.merged && (
						<PRCommentCard>
							<PRStatusHeadshot className="gray-background">
								<Icon name="git-merge" />
							</PRStatusHeadshot>
							<div style={{ padding: "5px 0" }}>
								<h1>Pull request successfully merged and closed</h1>
								You're all set&emdash;the <PRBranch>{pr.headRefName}</PRBranch> branch can be safely
								deleted.
							</div>
						</PRCommentCard>
					)}
				</PRComment>
				<PRComment>
					<Headshot size={40} person={derivedState.currentUser}></Headshot>
					<PRCommentCard className="add-comment">
						<div style={{ margin: "5px 0 0 0", border: "1px solid var(--base-border-color)" }}>
							<MessageInput
								multiCompose
								text={text}
								placeholder="Add Comment..."
								onChange={setText}
							/>
						</div>
						<ButtonRow>
							<div style={{ textAlign: "right", flexGrow: 1 }}>
								<Button
									disabled={pr.merged}
									isLoading={isLoadingCommentAndClose}
									onClick={onCommentAndCloseClick}
								>
									Close and comment
								</Button>

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
									<Button isLoading={isLoadingComment} onClick={onCommentClick}>
										Comment
									</Button>
								</Tooltip>
							</div>
						</ButtonRow>
					</PRCommentCard>
				</PRComment>
			</div>
			<PRSidebar>
				<PRSection>
					<h1>
						<InlineMenu
							className="subtle"
							items={reviewerMenuItems}
							onOpen={fetchAvailableReviewers}
							title="Request up to 15 reviewers"
							noChevronDown
						>
							<Icon name="gear" className="settings clickable" onClick={() => {}} />
							Reviewers
						</InlineMenu>
					</h1>
					{reviewers.map(_ => {
						return <PRHeadshotName key={_.avatarUrl} person={_} size={20} />;
					})}
				</PRSection>
				<PRSection>
					<h1>
						<InlineMenu
							className="subtle"
							items={assigneeMenuItems}
							onOpen={fetchAvailableAssignees}
							title="Assign up to 10 people to this pull request"
							noChevronDown
						>
							<Icon name="gear" className="settings clickable" onClick={() => {}} />
							Assignees
						</InlineMenu>
					</h1>
					{pr.assignees && pr.assignees.nodes.length > 0 ? (
						pr.assignees.nodes.map((_: any) => (
							<PRHeadshotName key={_.avatarUrl} person={_} size={20} />
						))
					) : (
						<>
							None yet&mdash;<a onClick={() => {}}>assign yourself</a>
						</>
					)}
				</PRSection>
				<PRSection>
					<h1>
						<InlineMenu
							className="subtle"
							items={labelMenuItems}
							onOpen={fetchAvailableLabels}
							title="Apply labels to this pull request"
							noChevronDown
						>
							<Icon name="gear" className="settings clickable" />
							Labels
						</InlineMenu>
					</h1>
					{pr.labels && pr.labels.nodes.length > 0
						? pr.labels.nodes.map(_ => <Tag tag={{ label: _.name, color: `#${_.color}` }} />)
						: "None yet"}
				</PRSection>
				<PRSection>
					<h1>
						<Icon name="gear" className="settings clickable" onClick={() => {}} />
						Projects
					</h1>
					{pr.projectCards && pr.projectCards.nodes.length > 0
						? pr.projectCards.nodes.map((_: any) => (
								<span key={_.project.name}>{_.project.name}</span>
						  ))
						: "None yet"}
				</PRSection>
				<PRSection>
					<h1>
						<Icon name="gear" className="settings clickable" onClick={() => {}} />
						Milestone
					</h1>
					{pr.milestone ? <div>{pr.milestone.title}</div> : "No milestone"}
				</PRSection>
				<PRSection>
					<h1>
						<Icon name="gear" className="settings clickable" onClick={() => {}} />
						Linked Issues
					</h1>
					None yet
				</PRSection>
				<PRSection>
					<h1>
						<Icon name="gear" className="settings clickable" onClick={() => {}} />
						Notifications
					</h1>
					<Button variant="secondary">
						<Icon name="mute" /> <span className="wide-text">Unsubscribe</span>
					</Button>
				</PRSection>
				<PRSection>
					<h1>{participantsLabel}</h1>
					{pr.participants &&
						pr.participants.nodes.map((_: any) => (
							<PRHeadshot display="inline-block" key={_.avatarUrl} person={_} size={20} />
						))}
				</PRSection>
				<PRSection style={{ borderBottom: "none" }}>
					<h1>
						<Icon name="lock" className="clickable" onClick={() => {}} /> Lock Conversation
					</h1>
				</PRSection>
			</PRSidebar>
		</PRContent>
	);
};
