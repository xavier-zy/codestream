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
	PRFoot,
	PRButtonRow
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
import { confirmPopup } from "./Confirm";
import { PullRequestCommentMenu } from "./PullRequestCommentMenu";
import { setEditorContext } from "../store/editorContext/actions";
import { markdownify } from "./Markdowner";
import { PullRequestMinimizedComment } from "./PullRequestMinimizedComment";

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
	quote: Function;
}

export const PullRequestTimelineItems = (props: PropsWithChildren<Props>) => {
	const { pr, setIsLoadingMessage, fetch } = props;
	if (!pr || !pr.timelineItems) return null;

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isResolving, setIsResolving] = useState(false);
	const [reviewOption, setReviewOption] = useState("COMMENT");
	const [reviewOptionText, setReviewOptionText] = useState("");
	const [openComments, setOpenComments] = useState({});
	const [pendingComments, setPendingComments] = useState({});
	const [editingComments, setEditingComments] = useState({});
	const [expandedComments, setExpandedComments] = useState({});

	// const [pendingComment, setPendingComment] = useState("");
	//const submitReview = async (event?: React.SyntheticEvent) => {
	// await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
	// 	method: "submitReview",
	//  providerId: pr.providerId,
	// 	params: {
	// 		pullRequestId: pr.id!,
	// 		text: reviewOptionText,
	// 		eventType: reviewOption
	// 	}
	// });
	// props.fetch();
	//};

	// const cancelReview = async (event?: React.SyntheticEvent) => {
	// 	await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
	// 		method: "submitReview",
	//      providerId: pr.providerId,
	// 		params: {
	// 			pullRequestId: pr.id!,
	// 			text: reviewOptionText,
	// 			eventType: "DISMISS"
	// 		}
	// 	});

	// 	props.fetch();
	// };

	const handleTextInputChanged = async (value: string, databaseCommentId: number | string) => {
		setPendingComments({
			...pendingComments,
			[databaseCommentId]: value
		});
	};

	const handleTextInputFocus = async (databaseCommentId: number) => {
		setOpenComments({
			...openComments,
			[databaseCommentId]: true
		});
	};

	const setEditingComment = (comment, value) => {
		setEditingComments({
			...editingComments,
			[comment.id]: value
		});
		setPendingComments({
			...pendingComments,
			[comment.id]: value ? comment.body : ""
		});
	};

	const expandComment = id => {
		setExpandedComments({
			...expandedComments,
			[id]: !expandedComments[id]
		});
	};

	const handleComment = async (e, databaseCommentId) => {
		try {
			const value = pendingComments[databaseCommentId];
			if (value == null) return;
			setIsSubmitting(true);

			await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
				method: "createCommentReply",
				providerId: pr.providerId,
				params: {
					pullRequestId: pr.id,
					commentId: databaseCommentId,
					text: value
				}
			});

			fetch().then(() => {
				setPendingComments({
					...pendingComments,
					[databaseCommentId]: undefined
				});
				setOpenComments({
					...openComments,
					[databaseCommentId]: false
				});
			});
		} catch (ex) {
			console.warn(ex);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleCancelComment = async (e, databaseCommentId) => {
		const value = pendingComments[databaseCommentId];
		if (value == null || value == undefined) {
			setOpenComments({
				...openComments,
				[databaseCommentId]: false
			});
			return;
		}
		if (value.length > 0) {
			confirmPopup({
				title: "Are you sure?",
				message: "",
				centered: true,
				buttons: [
					{ label: "Go Back", className: "control-button" },
					{
						label: "Discard Comment",
						className: "delete",
						wait: true,
						action: () => {
							setPendingComments({
								...pendingComments,
								[databaseCommentId]: undefined
							});
							setOpenComments({
								...openComments,
								[databaseCommentId]: false
							});
						}
					}
				]
			});
		}
	};

	const handleEdit = async (id: string, type: "PR" | "ISSUE" | "REVIEW" | "REVIEW_COMMENT") => {
		setIsLoadingMessage("Updating Comment...");
		try {
			const value = pendingComments[id];
			if (value == null) return;

			await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
				method:
					type === "REVIEW_COMMENT"
						? "updateReviewComment"
						: type === "ISSUE"
						? "updateIssueComment"
						: type === "PR"
						? "updatePullRequestBody"
						: "updateReview",
				providerId: pr.providerId,
				params: {
					pullRequestId: pr.id,
					id,
					body: value
				}
			});

			fetch().then(() => {
				setPendingComments({
					...pendingComments,
					[id]: undefined
				});
				setEditingComments({
					...editingComments,
					[id]: false
				});
			});
		} catch (ex) {
			console.warn(ex);
		} finally {
			setIsLoadingMessage();
		}
	};

	const handleCancelEdit = async (e, id) => {
		const value = pendingComments[id];
		if (value == null || value == undefined) {
			setEditingComments({
				...editingComments,
				[id]: false
			});
			return;
		}
		if (value.length > 0) {
			confirmPopup({
				title: "Are you sure?",
				message: "",
				centered: true,
				buttons: [
					{ label: "Go Back", className: "control-button" },
					{
						label: "Discard Edits",
						className: "delete",
						wait: true,
						action: () => {
							setPendingComments({
								...pendingComments,
								[id]: undefined
							});
							setEditingComments({
								...editingComments,
								[id]: false
							});
						}
					}
				]
			});
		}
	};

	const handleResolve = async (e, threadId) => {
		try {
			setIsResolving(true);
			await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
				method: "resolveReviewThread",
				providerId: pr.providerId,
				params: {
					threadId: threadId
				}
			});

			await props.fetch();
		} catch (ex) {
			console.warn(ex);
		} finally {
			setIsResolving(false);
		}
	};

	const handleUnresolve = async (e, threadId) => {
		try {
			setIsResolving(true);
			await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
				method: "unresolveReviewThread",
				providerId: pr.providerId,
				params: {
					threadId: threadId
				}
			});

			await props.fetch();
		} catch (ex) {
			console.warn(ex);
		} finally {
			setIsResolving(false);
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
			<PRComment style={{ marginTop: "10px" }}>
				<PRHeadshot person={pr.author} size={40} />
				<PRCommentCard className="dark-header">
					<PRCommentHeader>
						<div>
							<PRAuthor>{pr.author.login}</PRAuthor> commented{" "}
							<Timestamp time={pr.createdAt!} relative />
							{pr.includesCreatedEdit ? <> • edited</> : ""}
						</div>
						<PRActionIcons>
							{pr.author.login === me && Author}
							{pr.author.login === me ? <IAmMember /> : <UserIsMember />}
							<PullRequestReactButton
								pr={pr}
								targetId={pr.id}
								setIsLoadingMessage={setIsLoadingMessage}
								fetch={fetch}
								reactionGroups={pr.reactionGroups}
							/>
							<PullRequestCommentMenu
								pr={pr}
								comment={pr}
								setEdit={setEditingComment}
								quote={props.quote}
							/>
						</PRActionIcons>
					</PRCommentHeader>
					<PRCommentBody>
						{editingComments[pr.id] ? (
							<>
								<div style={{ border: "1px solid var(--base-border-color)" }}>
									<MessageInput
										autoFocus
										multiCompose
										text={pendingComments[pr.id] || ""}
										onChange={e => handleTextInputChanged(e, pr.id)}
										onSubmit={() => handleEdit(pr.id, "PR")}
									/>
								</div>
								<PRButtonRow>
									<Button variant="secondary" onClick={e => handleCancelEdit(e, pr.id)}>
										Cancel
									</Button>
									<Button variant="primary" onClick={() => handleEdit(pr.id, "PR")}>
										Update comment
									</Button>
								</PRButtonRow>
							</>
						) : pr.body ? (
							<MarkdownText text={pr.body} excludeParagraphWrap />
						) : (
							<i>No description provided.</i>
						)}
					</PRCommentBody>

					<PullRequestReactions
						pr={pr}
						targetId={pr.id}
						setIsLoadingMessage={setIsLoadingMessage}
						fetch={fetch}
						reactionGroups={pr.reactionGroups}
					/>
				</PRCommentCard>
			</PRComment>

			{timelineNodes.map((item, index) => {
				// console.warn("TIMELINE ITEM: ", item);
				const myItem = item.author && item.author.login === me;
				switch (item.__typename) {
					case "IssueComment":
						return (
							<PRComment key={index}>
								<PRHeadshot key={index} size={40} person={item.author} />
								<PRCommentCard className={`dark-header${item.isMinimized ? " no-arrow" : ""}`}>
									{item.isMinimized && !expandedComments[item.id] ? (
										<PullRequestMinimizedComment
											reason={item.minimizedReason}
											onClick={() => expandComment(item.id)}
										/>
									) : (
										<>
											<PRCommentHeader>
												<div>
													<PRAuthor>{item.author.login}</PRAuthor> commented{" "}
													<Timestamp time={item.createdAt!} relative />
													{item.includesCreatedEdit ? <> • edited</> : ""}
												</div>
												<PRActionIcons>
													{myItem && Author}
													{myPR ? <IAmMember /> : <UserIsMember />}
													<PullRequestReactButton
														pr={pr}
														targetId={item.id}
														setIsLoadingMessage={setIsLoadingMessage}
														fetch={fetch}
														reactionGroups={item.reactionGroups}
													/>
													<PullRequestCommentMenu
														pr={pr}
														comment={item}
														setEdit={setEditingComment}
														quote={props.quote}
													/>
												</PRActionIcons>
											</PRCommentHeader>
											<PRCommentBody>
												{editingComments[item.id] ? (
													<>
														<div style={{ border: "1px solid var(--base-border-color)" }}>
															<MessageInput
																autoFocus
																multiCompose
																text={pendingComments[item.id] || ""}
																onChange={e => handleTextInputChanged(e, item.id)}
																onSubmit={() => handleEdit(item.id, "ISSUE")}
															/>
														</div>
														<PRButtonRow>
															<Button
																variant="secondary"
																onClick={e => handleCancelEdit(e, item.id)}
															>
																Cancel
															</Button>
															<Button
																variant="primary"
																onClick={() => handleEdit(item.id, "ISSUE")}
															>
																Update comment
															</Button>
														</PRButtonRow>
													</>
												) : (
													<MarkdownText text={item.body} excludeParagraphWrap />
												)}
											</PRCommentBody>
											<PullRequestReactions
												pr={pr}
												targetId={item.id}
												setIsLoadingMessage={setIsLoadingMessage}
												fetch={fetch}
												reactionGroups={item.reactionGroups}
											/>
										</>
									)}
								</PRCommentCard>
							</PRComment>
						);
					case "PullRequestReview": {
						const reviewIcon = ReviewIcons[item.state];
						return (
							<PRComment key={index}>
								<PRTimelineItem key={index}>
									<PRHeadshot key={index} size={40} person={item.author} />
									{reviewIcon}
									<PRTimelineItemBody>
										<PRAuthor>{item.author.login}</PRAuthor>{" "}
										{item.state === "APPROVED" && "approved this review"}
										{item.state === "CHANGES_REQUESTED" && "requested changes"}
										{item.state === "COMMENTED" && "reviewed"}
										{item.state === "DISMISSED" && "dismissed this review"}
										{item.state === "PENDING" && "left a pending review" /* FIXME */}
										<Timestamp time={item.createdAt!} relative />
									</PRTimelineItemBody>
								</PRTimelineItem>
								{item.body && (
									<PRActionCommentCard className="dark-header">
										{item.isMinimized && !expandedComments[item.id] ? (
											<PullRequestMinimizedComment
												reason={item.minimizedReason}
												onClick={() => expandComment(item.id)}
											/>
										) : (
											<>
												<PRCommentHeader>
													<div>
														<PRAuthor>{item.author.login}</PRAuthor> commented{" "}
														<Timestamp time={item.createdAt!} relative />
														{item.includesCreatedEdit ? <> • edited</> : ""}
													</div>
													<PRActionIcons>
														{myItem && Author}
														{myPR ? <IAmMember /> : <UserIsMember />}
														<PullRequestReactButton
															pr={pr}
															targetId={item.id}
															setIsLoadingMessage={setIsLoadingMessage}
															fetch={fetch}
															reactionGroups={item.reactionGroups}
														/>
														<PullRequestCommentMenu
															pr={pr}
															comment={item}
															setEdit={setEditingComment}
															quote={props.quote}
														/>
													</PRActionIcons>
												</PRCommentHeader>

												<PRCommentBody>
													{editingComments[item.id] ? (
														<>
															<div style={{ border: "1px solid var(--base-border-color)" }}>
																<MessageInput
																	autoFocus
																	multiCompose
																	text={pendingComments[item.id] || ""}
																	onChange={e => handleTextInputChanged(e, item.id)}
																	onSubmit={() => handleEdit(item.id, "REVIEW")}
																/>
															</div>
															<PRButtonRow>
																<Button
																	variant="secondary"
																	onClick={e => handleCancelEdit(e, item.id)}
																>
																	Cancel
																</Button>
																<Button
																	variant="primary"
																	onClick={() => handleEdit(item.id, "REVIEW")}
																>
																	Update comment
																</Button>
															</PRButtonRow>
														</>
													) : (
														<MarkdownText text={item.body} excludeParagraphWrap />
													)}
												</PRCommentBody>
												<PullRequestReactions
													pr={pr}
													targetId={item.id}
													setIsLoadingMessage={setIsLoadingMessage}
													fetch={fetch}
													reactionGroups={item.reactionGroups}
												/>
											</>
										)}
									</PRActionCommentCard>
								)}
								{item.comments && item.comments.nodes && (
									<>
										{item.comments.nodes.map((comment, commentIndex) => {
											if (comment.isResolved && !expandedComments[`resolved-${comment.id}`]) {
												return (
													<PullRequestMinimizedComment
														reason={comment.path}
														isResolved
														className="outline"
														onClick={() => expandComment(`resolved-${comment.id}`)}
														key={`min-${comment.id}`}
													/>
												);
											}
											let extension = Path.extname(comment.path).toLowerCase();
											if (extension.startsWith(".")) {
												extension = extension.substring(1);
											}

											// FIXME
											const myComment = comment.author && comment.author.login === me;

											let startLine = 1;
											if (comment.diffHunk) {
												// this data looks like this => `@@ -234,3 +234,20 @@`
												const match = comment.diffHunk.match("@@ (.+) (.+) @@");
												if (match && match.length >= 2) {
													try {
														// the @@ line is actually not the first line... so subtract 1
														startLine = parseInt(match[2].split(",")[0].replace("+", ""), 10) - 1;
													} catch {}
												}
											}

											const codeHTML = prettyPrintOne(
												escapeHtml(comment.diffHunk),
												extension,
												startLine
											);

											let insertText: Function;
											let insertNewline: Function;
											let focusOnMessageInput: Function;

											const __onDidRender = ({
												insertTextAtCursor,
												insertNewlineAtCursor,
												focus
											}) => {
												insertText = insertTextAtCursor;
												insertNewline = insertNewlineAtCursor;
												focusOnMessageInput = focus;
											};

											const quote = text => {
												if (!insertText) return;
												handleTextInputFocus(comment.databaseId);
												focusOnMessageInput &&
													focusOnMessageInput(() => {
														insertText && insertText(text.replace(/^/gm, "> "));
														insertNewline && insertNewline();
													});
											};

											return (
												<PRThreadedCommentCard key={commentIndex}>
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
															{comment.isMinimized && !expandedComments[comment.id] ? (
																<PullRequestMinimizedComment
																	reason={item.minimizedReason}
																	onClick={() => expandComment(comment.id)}
																/>
															) : (
																<>
																	<PRHeadshot
																		key={commentIndex}
																		size={30}
																		person={comment.author}
																	/>
																	<PRThreadedCommentHeader>
																		{item.author.login}
																		<Timestamp time={comment.createdAt} />
																		<PRActionIcons>
																			{myComment && Author}
																			{myPR ? <IAmMember /> : <UserIsMember />}
																			<PullRequestReactButton
																				pr={pr}
																				targetId={comment.id}
																				setIsLoadingMessage={setIsLoadingMessage}
																				fetch={fetch}
																				reactionGroups={comment.reactionGroups}
																			/>
																			<PullRequestCommentMenu
																				pr={pr}
																				comment={comment}
																				setEdit={setEditingComment}
																				quote={quote}
																			/>
																		</PRActionIcons>
																	</PRThreadedCommentHeader>
																	{editingComments[comment.id] ? (
																		<>
																			<div style={{ border: "1px solid var(--base-border-color)" }}>
																				<MessageInput
																					autoFocus
																					multiCompose
																					text={pendingComments[comment.id] || ""}
																					onChange={e => handleTextInputChanged(e, comment.id)}
																					onSubmit={() => handleEdit(comment.id, "REVIEW_COMMENT")}
																				/>
																			</div>
																			<PRButtonRow>
																				<Button
																					variant="secondary"
																					onClick={e => handleCancelEdit(e, comment.id)}
																				>
																					Cancel
																				</Button>
																				<Button
																					variant="primary"
																					onClick={() => handleEdit(comment.id, "REVIEW_COMMENT")}
																				>
																					Update comment
																				</Button>
																			</PRButtonRow>
																		</>
																	) : (
																		<MarkdownText text={comment.body} excludeParagraphWrap />
																	)}
																</>
															)}
														</PRCodeCommentBody>
														<PullRequestReactions
															pr={pr}
															targetId={comment.id}
															setIsLoadingMessage={setIsLoadingMessage}
															fetch={fetch}
															reactionGroups={comment.reactionGroups}
														/>
														{comment.replies &&
															comment.replies.map((c, i) => {
																if (c.isMinimized && !expandedComments[c.id]) {
																	return (
																		<PullRequestMinimizedComment
																			reason={c.minimizedReason}
																			className="threaded"
																			onClick={() => expandComment(c.id)}
																		/>
																	);
																}

																return (
																	<div key={i}>
																		<PRCodeCommentBody>
																			<PRHeadshot key={c.id + i} size={30} person={c.author} />
																			<PRThreadedCommentHeader>
																				<b>{c.author.login}</b>
																				<Timestamp time={c.createdAt} />
																				{c.includesCreatedEdit ? <> • edited</> : ""}
																				<PRActionIcons>
																					{myComment && Author}
																					{myPR ? <IAmMember /> : <UserIsMember />}
																					<PullRequestReactButton
																						pr={pr}
																						targetId={c.id}
																						setIsLoadingMessage={setIsLoadingMessage}
																						fetch={fetch}
																						reactionGroups={c.reactionGroups}
																					/>
																					<PullRequestCommentMenu
																						pr={pr}
																						comment={c}
																						setEdit={setEditingComment}
																						quote={quote}
																					/>
																				</PRActionIcons>
																			</PRThreadedCommentHeader>
																			{editingComments[c.id] ? (
																				<>
																					<div
																						style={{ border: "1px solid var(--base-border-color)" }}
																					>
																						<MessageInput
																							autoFocus
																							multiCompose
																							text={pendingComments[c.id] || ""}
																							onChange={e => handleTextInputChanged(e, c.id)}
																							onSubmit={() => handleEdit(c.id, "REVIEW_COMMENT")}
																						/>
																					</div>
																					<PRButtonRow>
																						<Button
																							variant="secondary"
																							onClick={e => handleCancelEdit(e, c.id)}
																						>
																							Cancel
																						</Button>
																						<Button
																							variant="primary"
																							onClick={() => handleEdit(c.id, "REVIEW_COMMENT")}
																						>
																							Update comment
																						</Button>
																					</PRButtonRow>
																				</>
																			) : (
																				<MarkdownText text={c.body} excludeParagraphWrap />
																			)}
																		</PRCodeCommentBody>
																		<PullRequestReactions
																			pr={pr}
																			targetId={c.id}
																			setIsLoadingMessage={setIsLoadingMessage}
																			fetch={fetch}
																			reactionGroups={c.reactionGroups}
																		/>
																	</div>
																);
															})}
													</PRCodeComment>
													<PRCodeCommentReply>
														<Headshot key={index} size={30} person={derivedState.currentUser} />

														<div
															style={{
																margin: "0 0 0 40px",
																border: "1px solid var(--base-border-color)"
															}}
															className={openComments[comment.databaseId] ? "open-comment" : ""}
															onClick={e => handleTextInputFocus(comment.databaseId)}
														>
															<MessageInput
																multiCompose
																text={pendingComments[comment.databaseId] || ""}
																placeholder="Reply..."
																onChange={e => handleTextInputChanged(e, comment.databaseId)}
																onSubmit={e => handleComment(e, comment.databaseId)}
																__onDidRender={__onDidRender}
															/>
														</div>
														{openComments[comment.databaseId] && (
															<PRButtonRow>
																<Button
																	variant="secondary"
																	onClick={e => handleCancelComment(e, comment.databaseId)}
																>
																	Cancel
																</Button>

																<Button
																	variant="primary"
																	isLoading={isSubmitting}
																	onClick={e => handleComment(e, comment.databaseId)}
																>
																	Comment
																</Button>
															</PRButtonRow>
														)}
													</PRCodeCommentReply>
													<div style={{ height: "15px" }}></div>
													<PRButtonRow className="align-left border-top">
														{comment.isResolved && (
															<Button
																variant="secondary"
																isLoading={isResolving}
																onClick={e => handleUnresolve(e, comment.threadId)}
															>
																Unresolve conversation
															</Button>
														)}

														{!comment.isResolved && (
															<Button
																variant="secondary"
																isLoading={isResolving}
																onClick={e => handleResolve(e, comment.threadId)}
															>
																Resolve conversation
															</Button>
														)}
													</PRButtonRow>
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
							<div key={index}>
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
							</div>
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
						if (pr.state === "MERGED") {
							return (
								<div key={index}>
									<PRTimelineItem key={index} className="tall">
										<Icon name="git-merge" className="circled purple" />
										<PRTimelineItemBody>
											<PRHeadshotName key={index} person={item.actor} />
											merged this
											<Timestamp time={item.createdAt!} relative />
										</PRTimelineItemBody>
									</PRTimelineItem>
									{/* <PRFoot /> */}
								</div>
							);
						} else {
							return (
								<div key={index}>
									<PRTimelineItem key={index} className="tall">
										<Icon name="circle-slash" className="circled red" />
										<PRTimelineItemBody>
											<PRHeadshotName key={index} person={item.actor} />
											closed this
											<Timestamp time={item.createdAt!} relative />
										</PRTimelineItemBody>
									</PRTimelineItem>
									{/* <PRFoot /> */}
								</div>
							);
						}
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
