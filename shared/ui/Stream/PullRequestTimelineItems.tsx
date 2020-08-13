import {
	PRComment,
	PRCommentCard,
	PRCommentHeader,
	PRAuthor,
	PRActionIcons,
	PRCommentBody,
	PRTimelineItem,
	PRTimelineItemBody,
	PRBranch,
	PRActionCommentCard,
	PRCodeCommentBody,
	PRCodeComment,
	PRThreadedCommentCard,
	PRCodeCommentReply,
	PRThreadedCommentHeader,
	PRFoot
} from "./PullRequestComponents";
import React, { PropsWithChildren, useState } from "react";
import { PRHeadshot, Headshot } from "../src/components/Headshot";
import Timestamp from "./Timestamp";
import Icon from "./Icon";
import { MarkdownText } from "./MarkdownText";
import {
	FetchThirdPartyPullRequestPullRequest,
	ExecuteThirdPartyTypedType,
	CreatePullRequestCommentRequest
} from "@codestream/protocols/agent";
import Tag from "./Tag";
import { Link } from "./Link";
import { PRHeadshotName } from "../src/components/HeadshotName";
import { Author, IAmMember, UserIsMember } from "./PullRequestConversationTab";
import { prettyPrintOne } from "code-prettify";
import { escapeHtml } from "../utils";
import * as Path from "path-browserify";
import MessageInput from "./MessageInput";
import { Button } from "../src/components/Button";
import { PullRequestReactButton, PullRequestReactions } from "./PullRequestReactions";
import { HostApi } from "../webview-api";
import { RadioGroup, Radio } from "../src/components/RadioGroup";
import { useSelector } from "react-redux";
import { CodeStreamState } from "../store";
import { CSMe } from "@codestream/protocols/api";
import { SmartFormattedList } from "./SmartFormattedList";

const ReviewIcons = {
	APPROVED: <Icon name="check" className="circled green" />,
	CHANGES_REQUESTED: <Icon name="plus-minus" className="circled red" />,
	COMMENTED: <Icon name="eye" className="circled" />,
	// FIXME
	DISMISSED: <Icon name="x" className="circled" />,
	PENDING: <Icon name="blank" className="circled" />
};

interface Props {
	pr: FetchThirdPartyPullRequestPullRequest;
	setIsLoadingMessage: Function;
	fetch: Function;
}
export const PullRequestTimelineItems = (props: PropsWithChildren<Props>) => {
	const { pr, setIsLoadingMessage, fetch } = props;
	if (!pr || !pr.timelineItems) return null;

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [reviewOption, setReviewOption] = useState("COMMENT");
	const [reviewOptionText, setReviewOptionText] = useState("");
	const [pendingComments, setPendingComments] = useState({});
	// const [pendingComment, setPendingComment] = useState("");
	const submitReview = async (event?: React.SyntheticEvent) => {
		// await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
		// 	method: "submitReview",
		// 	providerId: "github*com",
		// 	params: {
		// 		pullRequestId: pr.id!,
		// 		text: reviewOptionText,
		// 		eventType: reviewOption
		// 	}
		// });
		// props.fetch();
	};

	// const cancelReview = async (event?: React.SyntheticEvent) => {
	// 	await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
	// 		method: "submitReview",
	// 		providerId: "github*com",
	// 		params: {
	// 			pullRequestId: pr.id!,
	// 			text: reviewOptionText,
	// 			eventType: "DISMISS"
	// 		}
	// 	});

	// 	props.fetch();
	// };

	const handleTextInputChanged = async (value: string, databaseCommentId: number) => {
		setPendingComments({
			...pendingComments,
			[databaseCommentId]: value
		});
	};

	const handleComment = async (e, databaseCommentId) => {
		try {
			const value = pendingComments[databaseCommentId];
			if (value == null) return;
			setIsSubmitting(true);
			await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
				method: "createCommentReply",
				providerId: "github*com",
				params: {
					pullRequestId: pr.id,
					commentId: databaseCommentId,
					text: value
				}
			});

			setPendingComments({
				...pendingComments,
				[databaseCommentId]: undefined
			});

			props.fetch();
		} catch (ex) {
			console.warn(ex);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleOnChangeReviewOptions = (value: string) => {
		setReviewOption(value);
	};

	const derivedState = useSelector((state: CodeStreamState) => {
		const currentUser = state.users[state.session.userId!] as CSMe;
		return { currentUser };
	});

	const me = "ppezaris"; // FIXME
	const myPR = pr.author.login === me;
	const timelineNodes = pr.timelineItems.nodes;
	return (
		<div>
			{timelineNodes.map((item, index) => {
				console.warn("TIMELINE ITEM: ", item);
				const myItem = item.author && item.author.login === me;
				switch (item.__typename) {
					case "IssueComment":
						return (
							<PRComment key={index}>
								<PRHeadshot key={index} size={40} person={item.author} />
								<PRCommentCard>
									<PRCommentHeader>
										<div>
											<PRAuthor>{item.author.login}</PRAuthor> commented{" "}
											<Timestamp time={item.createdAt!} relative />
										</div>
										<PRActionIcons>
											{myItem && Author}
											{myPR ? <IAmMember /> : <UserIsMember />}
											<PullRequestReactButton
												targetId={item.id}
												setIsLoadingMessage={setIsLoadingMessage}
												fetch={fetch}
												reactionGroups={item.reactionGroups}
											/>
											<Icon name="kebab-horizontal" className="clickable" />
										</PRActionIcons>
									</PRCommentHeader>
									<PRCommentBody>
										<MarkdownText text={item.body} excludeParagraphWrap />
									</PRCommentBody>
									<PullRequestReactions
										targetId={item.id}
										setIsLoadingMessage={setIsLoadingMessage}
										fetch={fetch}
										reactionGroups={item.reactionGroups}
									/>
								</PRCommentCard>
							</PRComment>
						);
					case "PullRequestReview": {
						console.warn("REVIEW: ", item);
						const reviewIcon = ReviewIcons[item.state];
						return (
							<PRComment key={index}>
								<PRTimelineItem key={index}>
									<PRHeadshot key={index} size={40} person={item.author} />
									{reviewIcon}
									<PRTimelineItemBody>
										<span className="highlight">{item.author.login}</span>{" "}
										{item.state === "APPROVED" && "approved this review"}
										{item.state === "CHANGES_REQUESTED" && "requested changes"}
										{item.state === "COMMENTED" && "reviewed"}
										{item.state === "DISMISSED" && "dismissed this review"}
										{item.state === "PENDING" && "left a pending review" /* FIXME */}
										<Timestamp time={item.createdAt!} relative />
									</PRTimelineItemBody>
								</PRTimelineItem>
								{item.body && (
									<PRActionCommentCard>
										<PRCommentHeader>
											<div>
												<PRAuthor>{item.author.login}</PRAuthor> commented{" "}
												<Timestamp time={item.createdAt!} relative />
											</div>
											<PRActionIcons>
												{myItem && Author}
												{myPR ? <IAmMember /> : <UserIsMember />}
												<PullRequestReactButton
													targetId={item.id}
													setIsLoadingMessage={setIsLoadingMessage}
													fetch={fetch}
													reactionGroups={item.reactionGroups}
												/>
												<Icon name="kebab-horizontal" className="clickable" />
											</PRActionIcons>
										</PRCommentHeader>

										<PRCommentBody>
											<MarkdownText text={item.body} excludeParagraphWrap />
										</PRCommentBody>
										<PullRequestReactions
											targetId={item.id}
											setIsLoadingMessage={setIsLoadingMessage}
											fetch={fetch}
											reactionGroups={item.reactionGroups}
										/>
									</PRActionCommentCard>
								)}
								{item.comments && item.comments.nodes && (
									<>
										{item.comments.nodes.map((comment, commentIndex) => {
											let extension = Path.extname(comment.path).toLowerCase();
											if (extension.startsWith(".")) {
												extension = extension.substring(1);
											}

											// FIXME
											const myComment = comment.author && comment.author.login === me;
											const startLine = 5;

											const codeHTML = prettyPrintOne(
												escapeHtml(comment.diffHunk),
												extension,
												startLine
											);

											return (
												<PRThreadedCommentCard>
													<PRCodeComment>
														<div className="row-with-icon-actions monospace ellipsis-left-container no-hover">
															<Icon name="file" />
															<span className="file-info ellipsis-left">
																<bdi dir="ltr">{comment.path}</bdi>
															</span>
														</div>
														<pre
															style={{ margin: "5px 0 10px 0" }}
															className="code prettyprint"
															data-scrollable="true"
															dangerouslySetInnerHTML={{ __html: codeHTML }}
														/>
														<PRCodeCommentBody>
															<PRHeadshot key={commentIndex} size={30} person={comment.author} />
															<PRThreadedCommentHeader>
																{item.author.login}
																<Timestamp time={comment.createdAt} />
																<PRActionIcons>
																	{myComment && Author}
																	{myPR ? <IAmMember /> : <UserIsMember />}
																	<PullRequestReactButton
																		targetId={comment.id}
																		setIsLoadingMessage={setIsLoadingMessage}
																		fetch={fetch}
																		reactionGroups={comment.reactionGroups}
																	/>
																	<Icon name="kebab-horizontal" className="clickable" />
																</PRActionIcons>
															</PRThreadedCommentHeader>
															<MarkdownText text={comment.body} excludeParagraphWrap />
														</PRCodeCommentBody>
														<PullRequestReactions
															targetId={comment.id}
															setIsLoadingMessage={setIsLoadingMessage}
															fetch={fetch}
															reactionGroups={comment.reactionGroups}
														/>
														{comment.pullRequest.reviewThreads &&
															comment.pullRequest.reviewThreads.edges &&
															comment.pullRequest.reviewThreads.edges[0].node &&
															comment.pullRequest.reviewThreads.edges[0].node.comments &&
															comment.pullRequest.reviewThreads.edges[0].node.comments.nodes &&
															comment.pullRequest.reviewThreads.edges[0].node.comments.nodes.map(
																(c, i) => {
																	return (
																		<PRCodeCommentBody>
																			<PRHeadshot key={c.id + i} size={30} person={c.author} />
																			<PRThreadedCommentHeader>
																				{c.author.login}
																				<Timestamp time={c.createdAt} />
																				<PRActionIcons>
																					{myComment && Author}
																					{myPR ? <IAmMember /> : <UserIsMember />}
																					{/*
																					<PullRequestReactButton
																						targetId={c.id}
																						setIsLoadingMessage={setIsLoadingMessage}
																						fetch={fetch}
																						reactionGroups={comment.reactionGroups}
																					/>
																					<Icon name="kebab-horizontal" className="clickable" />
																					*/}
																				</PRActionIcons>
																			</PRThreadedCommentHeader>
																			<MarkdownText text={c.body} excludeParagraphWrap />
																		</PRCodeCommentBody>
																	);
																}
															)}
													</PRCodeComment>
													<PRCodeCommentReply>
														<Headshot key={index} size={30} person={derivedState.currentUser} />

														<div
															style={{
																margin: "0 0 0 40px",
																border: "1px solid var(--base-border-color)"
															}}
														>
															<MessageInput
																multiCompose
																text={""}
																placeholder="Reply..."
																onChange={e => {
																	handleTextInputChanged(e, comment.databaseId);
																}}
															/>
														</div>
													</PRCodeCommentReply>
													<div style={{ height: "15px" }}></div>

													<Button variant="secondary">Resolve conversation</Button>
													<Button
														variant="primary"
														isLoading={isSubmitting}
														onClick={e => handleComment(e, comment.databaseId)}
													>
														Comment
													</Button>
												</PRThreadedCommentCard>
											);
										})}
									</>
								)}
							</PRComment>
						);
					}
					case "ReviewRequestedEvent": {
						return (
							<PRTimelineItem key={index} className="tall">
								<Icon name="review" className="circled" />
								<PRTimelineItemBody>
									<PRHeadshotName key={index} person={item.actor} />
									requested a review
								</PRTimelineItemBody>
							</PRTimelineItem>
						);
					}
					case "PullRequestCommit": {
						// look ahead to see how many commits there are in a row
						let futureCommitCount = 0;
						let i = index + 1;
						let authors: string[] = [];
						if (index == 0 || timelineNodes[index - 1].__typename !== "PullRequestCommit") {
							authors.push(item.commit.author.name);
							while (
								timelineNodes[i] &&
								timelineNodes[i] &&
								timelineNodes[i].__typename === "PullRequestCommit"
							) {
								authors.push(timelineNodes[i].commit.author.name);
								futureCommitCount++;
								i++;
							}
						}
						const { author, committer } = item.commit;

						return (
							<>
								{futureCommitCount > 0 && (
									<PRTimelineItem key={`commits-{index}`} className="tall-top">
										<Icon name="repo-push" className="circled" />
										<PRTimelineItemBody>
											<SmartFormattedList value={[...new Set(authors)]} /> added{" "}
											{futureCommitCount + 1} commits
											<Timestamp time={item.commit.authoredDate!} relative />
										</PRTimelineItemBody>
									</PRTimelineItem>
								)}
								<PRTimelineItem key={index}>
									<Icon name="git-commit" />
									<PRHeadshot key={index} size={20} person={author} />
									{committer && author.name !== committer.name && (
										<PRHeadshot className="left-pad" size={20} person={committer} />
									)}

									<PRTimelineItemBody>
										<div className="monospace left-pad">
											<Link
												href={`${pr.url}/commits/${item.commit.abbreviatedOid}`}
												className="monospace"
											>
												<MarkdownText
													excludeParagraphWrap
													excludeOnlyEmoji
													text={item.commit.message || ""}
												/>
											</Link>
										</div>
									</PRTimelineItemBody>
									<div className="monospace sha">
										<Link
											href={`${pr.url}/commits/${item.commit.abbreviatedOid}`}
											className="monospace"
										>
											{item.commit.abbreviatedOid}
										</Link>
									</div>
								</PRTimelineItem>
							</>
						);
					}
					case "AssignedEvent": {
						return (
							<PRTimelineItem key={index} className="tall">
								<Icon name="person" className="circled" />
								<PRTimelineItemBody>
									<PRHeadshotName key={index} size={20} person={item.actor} />
									{item.actor.login === item.assignee.login ? (
										"self-assigned this"
									) : (
										<>
											assigned <b>{item.assignee.login}</b>
										</>
									)}

									<Timestamp time={item.createdAt!} relative />
								</PRTimelineItemBody>
							</PRTimelineItem>
						);
					}
					case "UnassignedEvent": {
						return (
							<PRTimelineItem key={index} className="tall">
								<Icon name="person" className="circled" />
								<PRTimelineItemBody>
									<PRHeadshotName key={index} person={item.actor} />
									unassigned <b>{item.assignee.login}</b>
									<Timestamp time={item.createdAt!} relative />
								</PRTimelineItemBody>
							</PRTimelineItem>
						);
					}
					case "MergedEvent": {
						return (
							<PRTimelineItem key={index} className="tall">
								<Icon name="git-merge" className="circled" />
								<PRTimelineItemBody>
									<PRHeadshotName key={index} person={item.actor} />
									merged commit <PRBranch>{item.commit.abbreviatedOid}</PRBranch> into{" "}
									<PRBranch>{item.mergeRefName}</PRBranch>
									<Timestamp time={item.createdAt!} relative />
								</PRTimelineItemBody>
							</PRTimelineItem>
						);
					}
					case "LabeledEvent": {
						return (
							<PRTimelineItem key={index} className="tall">
								<Icon name="tag" className="circled" />
								<PRTimelineItemBody>
									<PRHeadshotName key={index} person={item.actor} />
									added
									<Tag tag={{ label: item.label.name, color: `#${item.label.color}` }} />
									<Timestamp time={item.createdAt!} relative />
								</PRTimelineItemBody>
							</PRTimelineItem>
						);
					}
					case "UnlabeledEvent": {
						return (
							<PRTimelineItem key={index} className="tall">
								<Icon name="tag" className="circled" />
								<PRTimelineItemBody>
									<PRHeadshotName key={index} person={item.actor} />
									removed
									<Tag tag={{ label: item.label.name, color: `#${item.label.color}` }} />
									<Timestamp time={item.createdAt!} relative />
								</PRTimelineItemBody>
							</PRTimelineItem>
						);
					}
					case "RenamedTitleEvent": {
						return (
							<PRTimelineItem key={index} className="tall">
								<Icon name="pencil" className="circled" />
								<PRTimelineItemBody>
									<PRHeadshotName key={index} person={item.actor} />
									changed the title <s>{item.previousTitle}</s> {item.currentTitle}
									<Timestamp time={item.createdAt!} relative />
								</PRTimelineItemBody>
							</PRTimelineItem>
						);
					}
					case "LockedEvent": {
						const map = {
							OFF_TOPIC: "off-topic",
							SPAM: "spam",
							TOO_HEATED: "too heated",
							RESOLVED: "resolved"
						};
						return (
							<PRTimelineItem key={index} className="tall">
								<Icon name="lock" className="circled gray" />
								<PRTimelineItemBody>
									<PRHeadshotName key={index} person={item.actor} />
									locked{" "}
									{map[item.lockReason] ? (
										<>
											as <b>{map[item.lockReason]}</b>
										</>
									) : (
										""
									)}{" "}
									and limited conversation to collaborators
									<Timestamp time={item.createdAt!} relative />
								</PRTimelineItemBody>
							</PRTimelineItem>
						);
					}
					case "UnlockedEvent": {
						return (
							<PRTimelineItem key={index} className="tall">
								<Icon name="key" className="circled gray" />
								<PRTimelineItemBody>
									<PRHeadshotName key={index} person={item.actor} />
									unlocked this conversation
									<Timestamp time={item.createdAt!} relative />
								</PRTimelineItemBody>
							</PRTimelineItem>
						);
					}
					case "ClosedEvent": {
						return (
							<>
								<PRTimelineItem key={index} className="tall">
									<Icon name="circle-slash" className="circled red" />
									<PRTimelineItemBody>
										<PRHeadshotName key={index} person={item.actor} />
										closed this
										<Timestamp time={item.createdAt!} relative />
									</PRTimelineItemBody>
								</PRTimelineItem>
								{/* <PRFoot /> */}
							</>
						);
					}
					case "ReopenedEvent": {
						return (
							<PRTimelineItem key={index} className="tall">
								<Icon name="circle" className="circled green" />
								<PRTimelineItemBody>
									<PRHeadshotName key={index} person={item.actor} />
									reopened this
									<Timestamp time={item.createdAt!} relative />
								</PRTimelineItemBody>
							</PRTimelineItem>
						);
					}
					case "MilestonedEvent": {
						return (
							<PRTimelineItem key={index} className="tall">
								<Icon name="milestone" className="circled" />
								<PRTimelineItemBody>
									<PRHeadshotName key={index} person={item.actor} />
									added this to the <b>{item.milestoneTitle}</b> milestone
									<Timestamp time={item.createdAt!} relative />
								</PRTimelineItemBody>
							</PRTimelineItem>
						);
					}
					case "DemilestonedEvent": {
						return (
							<PRTimelineItem key={index} className="tall">
								<Icon name="milestone" className="circled" />
								<PRTimelineItemBody>
									<PRHeadshotName key={index} person={item.actor} />
									removed milestone <b>{item.milestoneTitle}</b>
									<Timestamp time={item.createdAt!} relative />
								</PRTimelineItemBody>
							</PRTimelineItem>
						);
					}
					case "HeadRefForcePushedEvent": {
						return (
							<PRTimelineItem key={index} className="tall">
								<Icon name="milestone" className="circled" />
								<PRTimelineItemBody>
									<PRHeadshotName key={index} person={item.actor} />
									force-pushed the
									{item.ref && item.ref.name && <PRBranch>{item.ref.name}</PRBranch>} branch from{" "}
									<PRBranch>{item.beforeCommit.abbreviatedOid}</PRBranch> to{" "}
									<PRBranch>{item.afterCommit.abbreviatedOid}</PRBranch>
									<Timestamp time={item.createdAt!} relative />
								</PRTimelineItemBody>
							</PRTimelineItem>
						);
					}
					case "ReviewDismissedEvent": {
						return null; // FIXME
					}
					default: {
						console.warn(`timelineItem not found: ${item.__typename} item is: `, item);
						return null;
					}
				}
			})}
		</div>
	);
};
