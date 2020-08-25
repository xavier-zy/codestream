import React, { useState, useReducer } from "react";
import { useDispatch, useSelector } from "react-redux";
import { OpenUrlRequestType } from "@codestream/protocols/webview";
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
	MergePullRequestRequest,
	FetchThirdPartyPullRequestPullRequest
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
	PRBranch,
	PRTimelineItem,
	PRAction,
	PRReviewer,
	PRCloneURLButtons,
	PRCloneURL,
	PRCopyableTerminal,
	PRCloneURLWrapper
} from "./PullRequestComponents";
import { ButtonRow } from "./StatusPanel";
import { PullRequestTimelineItems } from "./PullRequestTimelineItems";
import { DropdownButton } from "./Review/DropdownButton";
import { InlineMenu } from "../src/components/controls/InlineMenu";
import { LoadingMessage } from "../src/components/LoadingMessage";
import styled from "styled-components";
import { Modal } from "./Modal";
import { Dialog } from "../src/components/Dialog";
import { Link } from "./Link";
import { PullRequestReactButton, PullRequestReactions } from "./PullRequestReactions";
import { setUserPreference } from "./actions";
import { PullRequestCommentMenu } from "./PullRequestCommentMenu";
import copy from "copy-to-clipboard";

const Circle = styled.div`
	width: 12px;
	height: 12px;
	border-radius: 6px;
	display: inline-block;
	margin-right: 5px;
	vertical-align: -1px;
`;

const UL = styled.ul`
	padding-left: 20px;
	li {
		margin: 5px 0;
	}
	margin: 20px 0;
`;

// https://docs.github.com/en/graphql/reference/enums#commentauthorassociation
const AUTHOR_ASSOCIATION_MAP = {
	COLLABORATOR: ["Collaborator", "Author has been invited to collaborate on the repository."],
	CONTRIBUTOR: ["Contributor", "Author has previously committed to the repository."],
	FIRST_TIMER: ["First Timer", "Author has not previously committed to GitHub."],
	FIRST_TIME_CONTRIBUTOR: [
		"First Time Contributor",
		"Author has not previously committed to the repository."
	],
	MEMBER: ["Member", "Author is a member of the organization that owns the repository."],
	NONE: ["None", "Author has no association with the repository."],
	OWNER: ["Owner", "Author is the owner of the repository."]
};

export const PRAuthorBadges = (props: { pr: FetchThirdPartyPullRequestPullRequest; node: any }) => {
	const { pr, node } = props;

	const badges: any[] = [];

	if (node.author.login === pr.author.login) {
		const isMe = node.author.login === pr.viewer.login;
		badges.push(
			<Tooltip
				key="author"
				title={`${isMe ? "You are" : "This user is"} the author of this pull request`}
				placement="bottom"
			>
				<div className="author">Author</div>
			</Tooltip>
		);
	}

	if (AUTHOR_ASSOCIATION_MAP[node.authorAssociation]) {
		badges.push(
			<Tooltip
				key="association"
				title={AUTHOR_ASSOCIATION_MAP[node.authorAssociation][1]}
				placement="bottom"
			>
				<div className="member">{AUTHOR_ASSOCIATION_MAP[node.authorAssociation][0]}</div>
			</Tooltip>
		);
	} else {
		console.warn("NO MEMBER ASSOCIATION FOR: ", node.authorAssociation);
	}
	return <>{badges}</>;
};

const EMPTY_HASH = {};
const EMPTY_ARRAY = [];
let insertText;
let insertNewline;
let focusOnMessageInput;

export const PullRequestConversationTab = (props: {
	pr: FetchThirdPartyPullRequestPullRequest;
	setIsLoadingMessage: Function;
	fetch: Function;
	ghRepo: any;
}) => {
	const { pr, ghRepo, fetch, setIsLoadingMessage } = props;
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const currentUser = state.users[state.session.userId!] as CSMe;
		const team = state.teams[state.context.currentTeamId];
		const blameMap = team.settings ? team.settings.blameMap : EMPTY_HASH;
		const skipGitEmailCheck = state.preferences.skipGitEmailCheck;
		const addBlameMapEnabled = isFeatureEnabled(state, "addBlameMap");
		const { preferences } = state;

		return {
			defaultMergeMethod: preferences.lastPRMergeMethod || "SQUASH",
			currentUser,
			currentPullRequestId: state.context.currentPullRequestId,
			blameMap,
			team,
			skipGitEmailCheck,
			addBlameMapEnabled
		};
	});

	const [text, setText] = useState("");
	const [availableLabels, setAvailableLabels] = useState(EMPTY_ARRAY);
	const [availableReviewers, setAvailableReviewers] = useState(EMPTY_ARRAY);
	const [availableAssignees, setAvailableAssignees] = useState(EMPTY_ARRAY);
	const [availableProjects, setAvailableProjects] = useState<[] | undefined>();
	const [availableMilestones, setAvailableMilestones] = useState<[] | undefined>();
	const [availableIssues, setAvailableIssues] = useState(EMPTY_ARRAY);
	const [isLoadingComment, setIsLoadingComment] = useState(false);
	const [isLoadingCommentAndClose, setIsLoadingCommentAndClose] = useState(false);
	const [isLocking, setIsLocking] = useState(false);
	const [isLockingReason, setIsLockingReason] = useState("");
	const [isLoadingLocking, setIsLoadingLocking] = useState(false);
	const [mergeMethod, setMergeMethod] = useState(derivedState.defaultMergeMethod);
	const [clInstructionsIsOpen, toggleClInstructions] = useReducer((open: boolean) => !open, false);
	const [cloneURLType, setCloneURLType] = useState("https");
	const [cloneURL, setCloneURL] = useState(`${pr.repository.url}.git`);

	const __onDidRender = ({ insertTextAtCursor, insertNewlineAtCursor, focus }) => {
		insertText = insertTextAtCursor;
		insertNewline = insertNewlineAtCursor;
		focusOnMessageInput = focus;
	};

	const quote = text => {
		if (!insertText) return;
		focusOnMessageInput &&
			focusOnMessageInput(() => {
				insertText && insertText(text.replace(/^/gm, "> "));
				insertNewline && insertNewline();
			});
	};

	const onCommentClick = async (event?: React.SyntheticEvent) => {
		setIsLoadingComment(true);
		await HostApi.instance.send(
			new ExecuteThirdPartyTypedType<CreatePullRequestCommentRequest, any>(),
			{
				method: "createPullRequestComment",
				providerId: pr.providerId,
				params: {
					pullRequestId: derivedState.currentPullRequestId!,
					text: text
				}
			}
		);
		setText("");
		fetch().then(() => setIsLoadingComment(false));
	};

	const onCommentAndCloseClick = async e => {
		setIsLoadingMessage("Closing...");
		setIsLoadingCommentAndClose(true);
		await HostApi.instance.send(
			new ExecuteThirdPartyTypedType<CreatePullRequestCommentAndCloseRequest, any>(),
			{
				method: "createPullRequestCommentAndClose",
				providerId: pr.providerId,
				params: {
					pullRequestId: derivedState.currentPullRequestId!,
					text: text
				}
			}
		);
		setText("");
		fetch().then(() => setIsLoadingCommentAndClose(false));
	};

	const onCommentAndReopenClick = async e => {
		setIsLoadingMessage("Reopening...");
		setIsLoadingCommentAndClose(true);
		await HostApi.instance.send(
			new ExecuteThirdPartyTypedType<CreatePullRequestCommentAndCloseRequest, any>(),
			{
				method: "createPullRequestCommentAndReopen",
				providerId: pr.providerId,
				params: {
					pullRequestId: derivedState.currentPullRequestId!,
					text: text
				}
			}
		);
		setText("");
		fetch().then(() => setIsLoadingCommentAndClose(false));
	};

	const mergePullRequest = async (options: { mergeMethod: MergeMethod }) => {
		setIsLoadingMessage("Merging...");
		dispatch(setUserPreference(["lastPRMergeMethod"], options.mergeMethod));
		await HostApi.instance.send(
			new ExecuteThirdPartyTypedType<MergePullRequestRequest, boolean>(),
			{
				method: "mergePullRequest",
				providerId: pr.providerId,
				params: {
					pullRequestId: derivedState.currentPullRequestId!,
					mergeMethod: options.mergeMethod
				}
			}
		);
		fetch();
	};

	const lockPullRequest = async () => {
		setIsLoadingLocking(true);
		let reason = "";
		switch (isLockingReason) {
			case "Off-topic":
				reason = "OFF_TOPIC";
				break;
			case "Too heated":
				reason = "TOO_HEATED";
				break;
			case "Spam":
				reason = "SPAM";
				break;
			case "RESOLVED":
				reason = "RESOLVED";
				break;
		}

		await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
			method: "lockPullRequest",
			providerId: pr.providerId,
			params: {
				pullRequestId: derivedState.currentPullRequestId!,
				lockReason: reason
			}
		});
		fetch().then(() => {
			setIsLocking(false);
			setIsLoadingLocking(false);
		});
	};

	const unlockPullRequest = async () => {
		setIsLoadingLocking(true);
		await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
			method: "unlockPullRequest",
			providerId: pr.providerId,
			params: {
				pullRequestId: derivedState.currentPullRequestId!
			}
		});
		fetch().then(() => {
			setIsLocking(false);
			setIsLoadingLocking(false);
		});
	};

	const numParticpants = ((pr.participants && pr.participants.nodes) || []).length;
	const participantsLabel = `${numParticpants} Participant${numParticpants == 1 ? "" : "s"}`;

	var reviewersHash: any = {};
	// the list of reviewers isn't in a single spot...
	// these are reviews that have been requested (though not started)
	pr.reviewRequests &&
		pr.reviewRequests.nodes.reduce((map, obj) => {
			map[obj.requestedReviewer.id] = {
				...obj.requestedReviewer,
				isPending: true
			};
			return map;
		}, reviewersHash);
	// these are in-progress reviews
	pr.reviews &&
		pr.reviews.nodes.reduce((map, obj) => {
			map[obj.author.id] = { ...obj, ...obj.author };
			return map;
		}, reviewersHash);

	const reviewers = Object.keys(reviewersHash).map(key => {
		const val = reviewersHash[key];
		return { ...val, id: key };
	}) as { id: string; login: string; avatarUrl: string; isPending: boolean; state: string }[];

	const fetchAvailableReviewers = async (e?) => {
		const reviewers = await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
			method: "getReviewers",
			providerId: pr.providerId,
			params: {
				owner: ghRepo.repoOwner,
				repo: ghRepo.repoName
			}
		});
		setAvailableReviewers(reviewers);
	};

	const reviewerMenuItems = React.useMemo(() => {
		const reviewerIds = reviewers.map(_ => _.id);
		if (availableReviewers && availableReviewers.length) {
			const menuItems = availableReviewers.map((_: any) => ({
				checked: reviewerIds.includes(_.id),
				label: <PRHeadshotName person={_} className="no-padding" />,
				subtle: _.name,
				searchLabel: `${_.login}:${_.name}`,
				key: _.id,
				action: () => (_.isPending ? removeReviewer(_.id) : addReviewer(_.id))
			})) as any;
			menuItems.unshift({ type: "search", placeholder: "Type or choose a name" });
			return menuItems;
		} else {
			return [{ label: <LoadingMessage>Loading Reviewers...</LoadingMessage>, noHover: true }];
		}
	}, [availableReviewers, pr]);

	const removeReviewer = async id => {
		// await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
		// 	method: "removeReviewerFromPullRequest",
		// 	providerId: pr.providerId,
		// 	params: {
		// 		pullRequestId: pr.id,
		// 		userId: id
		// 	}
		// });
		// fetch();
	};
	const addReviewer = async id => {
		await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
			method: "addReviewerToPullRequest",
			providerId: pr.providerId,
			params: {
				pullRequestId: pr.id,
				userId: id
			}
		});
		fetch();
	};

	const fetchAvailableAssignees = async (e?) => {
		const assignees = await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
			method: "getReviewers",
			providerId: pr.providerId,
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
				action: () => toggleAssignee(_.id, !assigneeIds.includes(_.login))
			})) as any;
			menuItems.unshift({ type: "search", placeholder: "Type or choose a name" });
			return menuItems;
		} else {
			return [{ label: <LoadingMessage>Loading Assignees...</LoadingMessage>, noHover: true }];
		}
	}, [availableAssignees, pr]);

	const toggleAssignee = async (id: string, onOff: boolean) => {
		setIsLoadingMessage(onOff ? "Adding Assignee..." : "Removing Assignee...");
		await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
			method: "setAssigneeOnPullRequest",
			providerId: pr.providerId,
			params: {
				pullRequestId: derivedState.currentPullRequestId,
				assigneeId: id,
				onOff
			}
		});
		fetch();
	};

	const fetchAvailableLabels = async (e?) => {
		const labels = await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
			method: "getLabels",
			providerId: pr.providerId,
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
			const menuItems = availableLabels.map((_: any) => {
				const checked = existingLabelIds.includes(_.id);
				return {
					checked,
					label: (
						<>
							<Circle style={{ backgroundColor: `#${_.color}` }} />
							{_.name}
						</>
					),
					searchLabel: _.name,
					key: _.id,
					subtext: <div style={{ maxWidth: "250px", whiteSpace: "normal" }}>{_.description}</div>,
					action: () => setLabel(_.id, !checked)
				};
			}) as any;
			menuItems.unshift({ type: "search", placeholder: "Filter labels" });
			return menuItems;
		} else {
			return [{ label: <LoadingMessage>Loading Labels...</LoadingMessage>, noHover: true }];
		}
	}, [availableLabels, pr]);

	const setLabel = async (id: string, onOff: boolean) => {
		setIsLoadingMessage(onOff ? "Adding Label..." : "Removing Label...");
		await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
			method: "setLabelOnPullRequest",
			providerId: pr.providerId,
			params: {
				pullRequestId: derivedState.currentPullRequestId,
				labelId: id,
				onOff
			}
		});
		fetch();
	};

	const fetchAvailableProjects = async (e?) => {
		const projects = await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
			method: "getProjects",
			providerId: pr.providerId,
			params: {
				owner: ghRepo.repoOwner,
				repo: ghRepo.repoName
			}
		});
		setAvailableProjects(projects);
	};

	const projectMenuItems = React.useMemo(() => {
		if (availableProjects && availableProjects.length) {
			const existingProjectIds = pr.projectCards
				? pr.projectCards.nodes.map(_ => _.project.id)
				: [];
			const menuItems = availableProjects.map((_: any) => {
				const checked = existingProjectIds.includes(_.id);
				return {
					checked,
					label: _.name,
					searchLabel: _.name,
					key: _.id,
					subtext: <div style={{ maxWidth: "250px", whiteSpace: "normal" }}>{_.description}</div>,
					action: () => setProject(_.id, !checked)
				};
			}) as any;
			menuItems.unshift({ type: "search", placeholder: "Filter Projects" });
			return menuItems;
		} else if (availableProjects) {
			return [{ label: <LoadingMessage noIcon>No projects found</LoadingMessage>, noHover: true }];
		} else {
			return [{ label: <LoadingMessage>Loading Projects...</LoadingMessage>, noHover: true }];
		}
	}, [availableProjects, pr]);

	const setProject = async (id: string, onOff: boolean) => {
		setIsLoadingMessage(onOff ? "Adding to Project..." : "Removing from Project...");
		await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
			method: "toggleProjectOnPullRequest",
			providerId: pr.providerId,
			params: {
				pullRequestId: derivedState.currentPullRequestId,
				projectId: id,
				onOff
			}
		});
		fetch();
	};

	const fetchAvailableMilestones = async (e?) => {
		const milestones = await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
			method: "getMilestones",
			providerId: pr.providerId,
			params: {
				owner: ghRepo.repoOwner,
				repo: ghRepo.repoName
			}
		});
		setAvailableMilestones(milestones);
	};

	const milestoneMenuItems = React.useMemo(() => {
		if (availableMilestones && availableMilestones.length) {
			const existingMilestoneId = pr.milestone ? pr.milestone.id : "";
			const menuItems = availableMilestones.map((_: any) => {
				const checked = existingMilestoneId === _.id;
				return {
					checked,
					label: _.title,
					searchLabel: _.title,
					key: _.id,
					subtext: _.dueOn && (
						<>
							Due by
							<Timestamp time={_.dueOn} dateOnly />
						</>
					),
					action: () => setMilestone(_.id, !checked)
				};
			}) as any;
			menuItems.unshift({ type: "search", placeholder: "Filter Milestones" });
			return menuItems;
		} else if (availableMilestones) {
			return [
				{ label: <LoadingMessage noIcon>No milestones found</LoadingMessage>, noHover: true }
			];
		} else {
			return [{ label: <LoadingMessage>Loading Milestones...</LoadingMessage>, noHover: true }];
		}
	}, [availableMilestones, pr]);

	const setMilestone = async (id: string, onOff: boolean) => {
		setIsLoadingMessage(onOff ? "Adding Milestone..." : "Clearing Milestone...");
		await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
			method: "toggleMilestoneOnPullRequest",
			providerId: pr.providerId,
			params: {
				pullRequestId: derivedState.currentPullRequestId,
				milestoneId: id,
				onOff
			}
		});
		fetch();
	};

	const fetchAvailableIssues = async (e?) => {
		const issues = await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
			method: "getIssues",
			providerId: pr.providerId,
			params: {
				owner: ghRepo.repoOwner,
				repo: ghRepo.repoName
			}
		});
		setAvailableIssues(issues);
	};

	// const issueMenuItems = React.useMemo(() => {
	// 	if (availableIssues && availableIssues.length) {
	// 		const existingIssueIds = pr.issues ? pr.issues.nodes.map(_ => _.id) : [];
	// 		const menuItems = availableIssues.map((_: any) => {
	// 			const checked = existingIssueIds.includes(_.id);
	// 			return {
	// 				checked,
	// 				label: <>{_.name}</>,
	// 				searchLabel: _.name,
	// 				key: _.id,
	// 				subtext: <div style={{ maxWidth: "250px", whiteSpace: "normal" }}>{_.description}</div>,
	// 				action: () => setIssue(_.id, !checked)
	// 			};
	// 		}) as any;
	// 		menuItems.unshift({ type: "search", placeholder: "Filter" });
	// 		return menuItems;
	// 	} else {
	// 		return [{ label: <LoadingMessage>Loading Issues...</LoadingMessage>, noHover: true }];
	// 	}
	// }, [availableIssues, pr]);

	const setIssue = async (id: string, onOff: boolean) => {
		setIsLoadingMessage(onOff ? "Adding Issue..." : "Removing Issue...");
		await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
			method: "setIssueOnPullRequest",
			providerId: pr.providerId,
			params: {
				owner: ghRepo.repoOwner,
				repo: ghRepo.repoName,
				pullRequestId: pr.number,
				issueId: id,
				onOff
			}
		});
		fetch();
	};

	const toggleSubscription = async () => {
		const onOff = pr.viewerSubscription === "SUBSCRIBED" ? false : true;
		setIsLoadingMessage(onOff ? "Subscribing..." : "Unsubscribing...");
		await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
			method: "updatePullRequestSubscription",
			providerId: pr.providerId,
			params: {
				owner: ghRepo.repoOwner,
				repo: ghRepo.repoName,
				pullRequestId: derivedState.currentPullRequestId,
				onOff
			}
		});
		fetch();
	};

	// console.warn("ASSI: ", assigneeMenuItems);
	return (
		<PRContent>
			{isLocking && (
				<Modal translucent verticallyCenter>
					{pr.locked ? (
						<Dialog
							title="Unlock conversation on this pull request"
							onClose={() => setIsLocking(false)}
							narrow
						>
							<UL>
								<li>
									<b>Everyone</b> will be able to comment on this pull request once more.
								</li>
								<li>You can always lock this pull request again in the future.</li>
							</UL>
							<Button fillParent onClick={() => unlockPullRequest()} isLoading={isLoadingLocking}>
								Unlock conversation on this pull request
							</Button>
						</Dialog>
					) : (
						<Dialog
							title="Lock conversation on this pull request"
							onClose={() => setIsLocking(false)}
							narrow
						>
							<UL>
								<li>
									Other users <b>can’t add new comments</b> to this pull request.
								</li>
								<li>
									You and other members of teams with write access to this repository{" "}
									<b>can still leave comments</b> that others can see.
								</li>
								<li>You can always unlock this pull request again in the future.</li>
							</UL>
							<b>Reason for locking</b>
							<div style={{ margin: "5px 0" }}>
								<InlineMenu
									items={[
										{
											label: "Choose a reason",
											key: "choose",
											action: () => setIsLockingReason("Choose a reason")
										},
										{
											label: "Off-topic",
											key: "topic",
											action: () => setIsLockingReason("Off-topic")
										},
										{
											label: "Too heated",
											key: "heated",
											action: () => setIsLockingReason("Too heated")
										},
										{
											label: "Resolved",
											key: "resolved",
											action: () => setIsLockingReason("Resolved")
										},
										{ label: "Spam", key: "spam", action: () => setIsLockingReason("Spam") }
									]}
								>
									{isLockingReason || "Choose a reason"}
								</InlineMenu>
							</div>
							<div className="subtle" style={{ fontSize: "smaller", margin: "10px 0 20px 0" }}>
								Optionally, choose a reason for locking that others can see. Learn more about when
								it’s appropriate to{" "}
								<Link href="https://docs.github.com/en/github/building-a-strong-community/locking-conversations">
									lock conversations
								</Link>
								.
							</div>
							<Button fillParent onClick={() => lockPullRequest()} isLoading={isLoadingLocking}>
								Lock conversation on this pull request
							</Button>
						</Dialog>
					)}
				</Modal>
			)}
			<div className="main-content">
				<PRConversation>
					{/* in the GH data model, the top box is part of the pr, rather than the timeline */}
					<PullRequestTimelineItems
						pr={pr}
						setIsLoadingMessage={setIsLoadingMessage}
						fetch={fetch}
						quote={quote}
					/>
					<PRFoot />
				</PRConversation>

				{!pr.merged && pr.mergeable === "MERGEABLE" && pr.state !== "CLOSED" && (
					<PRTimelineItem>
						<PRAction>
							Add more commits by pushing to the <PRBranch>{pr.headRefName}</PRBranch> branch on{" "}
							<PRBranch>
								{ghRepo.repoOwner}/{ghRepo.repoName}
							</PRBranch>
							.
						</PRAction>
					</PRTimelineItem>
				)}

				<PRComment>
					{/* 
<PRStatusIcon>
	<Icon name={statusIcon}  />
</PRStatusIcon>
*/}
					{!pr.merged && pr.mergeable === "MERGEABLE" && pr.state !== "CLOSED" && (
						<PRCommentCard className="green-border dark-header">
							<PRStatusHeadshot className="green-background">
								<Icon name="git-merge" />
							</PRStatusHeadshot>
							<PRCommentHeader>
								<div style={{ display: "flex", marginTop: "10px" }}>
									<PRIconButton className="green-background">
										<Icon name="check" />
									</PRIconButton>
									<div style={{ marginLeft: "10px" }}>
										{mergeMethod === "REBASE" ? (
											<>
												<h1>This branch has no conflicts with the base branch when rebasing</h1>
												<p>Rebase and merge can be performed automatically.</p>
											</>
										) : (
											<>
												<h1>This branch has no conflicts with the base branch</h1>
												<p>Merging can be performed automatically.</p>
											</>
										)}
									</div>
								</div>
							</PRCommentHeader>
							<div style={{ padding: "5px 0" }}>
								<PRButtonRow className="align-left">
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
												key: "MERGE",
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
												onSelect: () => setMergeMethod("MERGE"),
												action: () => mergePullRequest({ mergeMethod: "MERGE" })
											},
											{
												key: "SQUASH",
												label: "Squash and merge",
												subtext: (
													<span>
														The commits from this branch will be combined
														<br />
														into one commit in the base branch.
													</span>
												),
												disabled: !ghRepo.squashMergeAllowed,
												onSelect: () => setMergeMethod("SQUASH"),
												action: () => mergePullRequest({ mergeMethod: "SQUASH" })
											},
											{
												key: "REBASE",
												label: "Rebase and merge",
												subtext: (
													<span>
														The commits from this branch will be rebased
														<br />
														and added to the base branch.
													</span>
												),
												disabled: !ghRepo.rebaseMergeAllowed,
												onSelect: () => setMergeMethod("REBASE"),
												action: () => mergePullRequest({ mergeMethod: "REBASE" })
											}
										]}
										selectedKey={derivedState.defaultMergeMethod}
										variant="success"
										splitDropdown
									/>
								</PRButtonRow>
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
									<div style={{ marginLeft: "10px", marginRight: "10px"   }}>
										<h1>This branch has conflicts that must be resolved</h1>
									</div>
									<Button
										variant="secondary"
										onClick={() => {
											HostApi.instance.send(OpenUrlRequestType, { url: `${pr.url}/conflicts` });
										}}
									>
										Resolve conflicts
									</Button>
								</div>
								<div>
									<p>
										Use the <Link href={`${pr.url}/conflicts`}>web editor</Link>{" "}
										or the <Link onClick={toggleClInstructions}>command line</Link>{" "}
										to resolve conflicts.
									</p>
								</div>
								{clInstructionsIsOpen && (
									<div>
										<hr />
										<h3>Checkout via command line</h3>
										<p>
											If you cannot merge a pull request automatically here, you have the option
											of checking it out via command line to resolve conflicts and perform
											a manual merge.
										</p>
										<PRCloneURLWrapper>
											<PRCloneURLButtons>
												<Button
													variant={ cloneURLType === "https" ? "primary" : "secondary" }
													onClick={e => {
														setCloneURLType("https");
														setCloneURL(`${pr.repository.url}.git`);
													}}
												>
													HTTPS
												</Button>
												<Button
													variant={ cloneURLType === "ssh" ? "primary" : "secondary" }
													onClick={e => {
														setCloneURLType("ssh") ;
														setCloneURL(`git@github.com:${pr.repository.nameWithOwner}.git`);
													}}
												>
													SSH
												</Button>
												<Button
													variant={ cloneURLType === "patch" ? "primary" : "secondary" }
													onClick={e => {
														setCloneURLType("patch");
														setCloneURL(`${pr.url}.patch`);
													}}
												>
													Patch
												</Button>
											</PRCloneURLButtons>
											<PRCloneURL>
												<div className="clone-url">
													{cloneURL}
												</div>
												<Icon
													title="Copy"
													placement="bottom"
													name="copy"
													className="clickable"
													onClick={e => copy(cloneURL)}
												/>
											</PRCloneURL>
										</PRCloneURLWrapper>
										<p><b>Step 1:</b> From your project repository, bring in the changes and test.</p>
										<CopyableTerminal
											code={
												`git fetch origin\n` +
												`git checkout -b ${pr.repository.name} origin/${pr.repository.name}\n` +
												`git merge ${pr.baseRefName}`
											}
										/>
										<p><b>Step 2:</b> Merge the changes and update on GitHub.</p>
										<CopyableTerminal
											code={
												`git checkout ${pr.baseRefName}\n` +
												`git merge --no-ff ${pr.repository.name}\n` +
												`git push origin ${pr.baseRefName}`
											}
										/>
									</div>
								)}
							</div>
						</PRCommentCard>
					)}
					{!pr.merged && pr.mergeable !== "CONFLICTING" && pr.state === "CLOSED" && (
						<PRCommentCard>
							<PRStatusHeadshot className="gray-background">
								<Icon name="git-merge" />
							</PRStatusHeadshot>
							<div style={{ padding: "5px 0" }}>
								<h1>Closed with unmerged commits</h1>
								This pull request is closed, but the <PRBranch>{pr.headRefName}</PRBranch> branch
								has unmerged commits.
							</div>
						</PRCommentCard>
					)}
					{/* !pr.merged && pr.state === "CLOSED" && <div>Pull request is closed</div> */}
					{pr.merged && (
						<PRCommentCard>
							<PRStatusHeadshot className="pr-purple-background">
								<Icon name="git-merge" />
							</PRStatusHeadshot>
							<div style={{ padding: "5px 0" }}>
								<h1>Pull request successfully merged and closed</h1>
								You're all set&mdash;the <PRBranch>{pr.headRefName}</PRBranch> branch can be safely
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
								onSubmit={onCommentClick}
								__onDidRender={__onDidRender}
							/>
						</div>
						<ButtonRow>
							{pr.state === "CLOSED" ? (
								<div style={{ textAlign: "right", flexGrow: 1 }}>
									<Button
										disabled={pr.merged}
										isLoading={isLoadingCommentAndClose}
										onClick={onCommentAndReopenClick}
										variant="secondary"
									>
										{text ? "Reopen and comment" : "Reopen pull request"}
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
										<Button isLoading={isLoadingComment} onClick={onCommentClick} disabled={!text}>
											Comment
										</Button>
									</Tooltip>
								</div>
							) : (
								<div style={{ textAlign: "right", flexGrow: 1 }}>
									{!pr.merged && (
										<Button isLoading={isLoadingCommentAndClose} onClick={onCommentAndCloseClick}>
											{text ? "Close and comment" : "Close pull request"}
										</Button>
									)}
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
										<Button isLoading={isLoadingComment} onClick={onCommentClick} disabled={!text}>
											Comment
										</Button>
									</Tooltip>
								</div>
							)}
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
					{reviewers.length > 0
						? reviewers.map((_, index) => (
								<PRReviewer key={index}>
									<PRHeadshotName key={_.avatarUrl} person={_} size={20} />
									{_.isPending && (
										<Tooltip placement="top" content={"Awaiting requested review from " + _.login}>
											<div className="status">
												<b className="pending" />
											</div>
										</Tooltip>
									)}
									{/*	{_.state === "APPROVED" && (
										<>
											<Tooltip placement="top" content={"Re-request review"}>
												<div className="status">
													<div className="status">
														<b onClick={e => addReviewer(_.id)}>↺</b>
													</div>
												</div>
									</Tooltip>
											<Tooltip placement="top" content={_.login + " approved these changes"}>
												<div className="status">
													<b>✓</b>
												</div>
											</Tooltip>
										</>
									)}*/}
									<br />
								</PRReviewer>
						  ))
						: "No reviewers"}
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
						pr.assignees.nodes.map((_: any, index: number) => (
							<span key={index}>
								<PRHeadshotName key={_.avatarUrl} person={_} size={20} />
								<br />
							</span>
						))
					) : (
						<>
							None yet&mdash;
							<a onClick={() => toggleAssignee(pr.viewer.id, true)}>assign yourself</a>
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
						? pr.labels.nodes.map((_, index) => (
								<Tag key={index} tag={{ label: _.name, color: `#${_.color}` }} />
						  ))
						: "None yet"}
				</PRSection>
				<PRSection>
					<h1>
						<InlineMenu
							className="subtle"
							items={projectMenuItems}
							onOpen={fetchAvailableProjects}
							title="Projects"
							noChevronDown
						>
							<Icon name="gear" className="settings clickable" onClick={() => {}} />
							Projects
						</InlineMenu>
					</h1>
					{pr.projectCards && pr.projectCards.nodes.length > 0
						? pr.projectCards.nodes.map((_: any) => (
								<div key={_.project.name} style={{ marginBottom: "5px" }}>
									<Icon name="project" /> {_.project.name}
								</div>
						  ))
						: "None yet"}
				</PRSection>
				<PRSection>
					<h1>
						<InlineMenu
							className="subtle"
							items={milestoneMenuItems}
							onOpen={fetchAvailableMilestones}
							title="Set milestone"
							noChevronDown
						>
							<Icon name="gear" className="settings clickable" onClick={() => {}} />
							Milestone
						</InlineMenu>
					</h1>
					{pr.milestone ? <div>{pr.milestone.title}</div> : "No milestone"}
				</PRSection>
				{/* https://github.community/t/get-all-issues-linked-to-a-pull-request/14653 
				<PRSection>
					<h1>
						<InlineMenu
							className="subtle"
							items={issueMenuItems}
							onOpen={fetchAvailableIssues}
							title="Link an issue from this repository"
							noChevronDown
						>
							<Icon name="gear" className="settings clickable" onClick={() => {}} />
							Linked Issues
						</InlineMenu>
					</h1>
					Successfully merging this pull request may close these issues.
					<div style={{ height: "10px" }}></div>
					None yet
				</PRSection>
				*/}
				<PRSection>
					<h1>
						{/* <Icon name="gear" className="settings clickable" onClick={() => {}} /> */}
						Notifications
					</h1>
					{pr.viewerSubscription === "SUBSCRIBED" ? (
						<>
							<Button variant="secondary" onClick={toggleSubscription}>
								<Icon name="mute" /> <span className="wide-text">Unsubscribe</span>
							</Button>
							<span className="wide-text">
								You’re receiving notifications because you’re subscribed to this pull request.
							</span>
						</>
					) : (
						<>
							<Button variant="secondary" onClick={toggleSubscription}>
								<Icon name="unmute" /> <span className="wide-text">Subscribe</span>
							</Button>
							<span className="wide-text">
								You’re not receiving notifications from this pull request.
							</span>
						</>
					)}
				</PRSection>
				<PRSection>
					<h1>{participantsLabel}</h1>
					{pr.participants &&
						pr.participants.nodes.map((_: any) => (
							<PRHeadshot display="inline-block" key={_.avatarUrl} person={_} size={20} />
						))}
				</PRSection>
				<PRSection style={{ borderBottom: "none" }}>
					{pr.viewerCanUpdate && (
						<h1 style={{ margin: 0, display: "flex" }}>
							{pr.locked ? (
								<a onClick={() => setIsLocking(true)}>
									<Icon name="key" className="clickable" style={{ marginRight: "5px" }} />
									Unlock Conversation
								</a>
							) : (
								<a onClick={() => setIsLocking(true)}>
									<Icon name="lock" className="clickable" style={{ marginRight: "5px" }} />
									Lock Conversation
								</a>
							)}
						</h1>
					)}
				</PRSection>
			</PRSidebar>
		</PRContent>
	);
};

const CopyableTerminal = (props: any) => {
	return (
		<PRCopyableTerminal>
			<code>
				<pre>
					{props.code}
				</pre>
			</code>
			<Icon
				title="Copy"
				placement="bottom"
				name="copy"
				className="clickable"
				onClick={e => copy(props.code)}
			/>
		</PRCopyableTerminal>
	);
};