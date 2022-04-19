import {
	PRActionIcons,
	PRButtonRow,
	PRBranch,
	PRCodeCommentBody,
	PRCodeCommentWrapper,
	PRThreadedCommentHeader
} from "./PullRequestComponents";
import React, { PropsWithChildren, useState } from "react";
import { PRHeadshot } from "../src/components/Headshot";
import Timestamp from "./Timestamp";
import Icon from "./Icon";
import { MarkdownText } from "./MarkdownText";
import { FetchThirdPartyPullRequestPullRequest } from "@codestream/protocols/agent";
import { PRAuthorBadges } from "./PullRequestConversationTab";
import { PullRequestReactButton, PullRequestReactions } from "./PullRequestReactions";
import { PullRequestCommentMenu } from "./PullRequestCommentMenu";
import { PullRequestMinimizedComment } from "./PullRequestMinimizedComment";
import { PullRequestEditingComment } from "./PullRequestEditingComment";
import { PullRequestReplyComment } from "./PullRequestReplyComment";
import { Button } from "../src/components/Button";
import { api } from "../store/providerPullRequests/actions";
import { useDispatch } from "react-redux";
import { GHOST } from "./PullRequestTimelineItems";
import { prettyPrintOne } from "code-prettify";
import { escapeHtml } from "../utils";
import * as Path from "path-browserify";
import styled from "styled-components";
import { Link } from "./Link";

const PRBranchContainer = styled.div`
	display: inline-block;
	font-family: Menlo, Consolas, "DejaVu Sans Mono", monospace;
	color: var(--text-color-subtle);
`;

const CodeBlockContainerIcons = styled.div`
	display: flex;
	margin-bottom: 5px;
	color: var(--text-color-subtle) !important;
`;

interface Props {
	pr: FetchThirdPartyPullRequestPullRequest;
	mode?: string;
	setIsLoadingMessage: Function;
	review: any;
	comment: any;
	author: any;
	skipResolvedCheck?: boolean;
	isFirst?: boolean;
}

export const PullRequestFileCommentCard = (props: PropsWithChildren<Props>) => {
	const { review, comment, author, setIsLoadingMessage, pr } = props;
	const dispatch = useDispatch();

	const [openComments, setOpenComments] = useState({});
	const [pendingComments, setPendingComments] = useState({});
	const [editingComments, setEditingComments] = useState({});
	const [expandedComments, setExpandedComments] = useState({});
	const [isResolving, setIsResolving] = useState(false);

	const doneEditingComment = id => {
		setEditingComments({ ...editingComments, [id]: false });
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

	const handleDiffClick = () => {
		return null;
	};

	const handleResolve = async (e, threadId) => {
		try {
			setIsResolving(true);
			await dispatch(
				api("resolveReviewThread", {
					threadId: threadId
				})
			);
		} catch (ex) {
			console.warn(ex);
		} finally {
			setIsResolving(false);
		}
	};

	const handleUnresolve = async (e, threadId) => {
		try {
			setIsResolving(true);
			await dispatch(
				api("unresolveReviewThread", {
					threadId: threadId
				})
			);
		} catch (ex) {
			console.warn(ex);
		} finally {
			setIsResolving(false);
		}
	};

	let insertText: Function;
	let insertNewline: Function;
	let focusOnMessageInput: Function;

	const __onDidRender = functions => {
		insertText = functions.insertTextAtCursor;
		insertNewline = functions.insertNewlineAtCursor;
		focusOnMessageInput = functions.focus;
	};

	const quote = text => {
		if (!insertText) return;
		handleTextInputFocus(comment.databaseId);
		focusOnMessageInput &&
			focusOnMessageInput(() => {
				insertText && insertText(text.replace(/^/gm, "> ") + "\n");
				insertNewline && insertNewline();
			});
	};

	const codeBlock = () => {
		const path = comment.path || "";
		let extension = Path.extname(path).toLowerCase();
		if (extension.startsWith(".")) {
			extension = extension.substring(1);
		}

		const codeHTML = prettyPrintOne(escapeHtml(comment.diffHunk), extension, lineNumber());
		return (
			<pre
				className="code prettyprint"
				data-scrollable="true"
				dangerouslySetInnerHTML={{ __html: codeHTML }}
			/>
		);
	};

	const lineNumber = () => {
		let rightLine = 0;

		if (!comment || !review) {
			return "";
		}

		let diffHunk = comment?.diffHunk || review?.diffHunk || "";

		diffHunk.split("\n").map(d => {
			const matches = d.match(/@@ \-(\d+).*? \+(\d+)/);
			if (matches) {
				rightLine = parseInt(matches[2]) - 1;
			}
		});

		if (rightLine) {
			return rightLine;
		} else {
			return "";
		}
	};

	console.warn("eric comment", comment);
	console.warn("eric pr", pr);

	if (
		!props.skipResolvedCheck &&
		comment.isResolved &&
		!expandedComments[`resolved-${comment.id}`]
	) {
		return (
			<PullRequestMinimizedComment
				reason={"This conversation was marked as resolved"}
				isResolved
				onClick={() => expandComment(`resolved-${comment.id}`)}
				key={`min-${comment.id}`}
			/>
		);
	}
	return (
		<PRCodeCommentWrapper>
			<PRCodeCommentBody>
				{review.isMinimized && !expandedComments[review.id] ? (
					<PullRequestMinimizedComment
						reason={review.minimizedReason}
						onClick={() => expandComment(review.id)}
					/>
				) : comment.isMinimized && !expandedComments[comment.id] ? (
					<PullRequestMinimizedComment
						reason={comment.minimizedReason}
						onClick={() => expandComment(comment.id)}
					/>
				) : (
					<>
						<PRHeadshot key={comment.id} size={30} person={comment.author || GHOST} />
						<PRThreadedCommentHeader>
							<b>{author.login}</b>
							<Timestamp time={comment.createdAt} relative />
							<PRActionIcons>
								<PRAuthorBadges pr={pr} node={comment} isPending={review.state === "PENDING"} />
								<PullRequestReactButton
									pr={pr}
									targetId={comment.id}
									setIsLoadingMessage={setIsLoadingMessage}
									reactionGroups={comment.reactionGroups}
								/>
								<PullRequestCommentMenu
									pr={pr}
									setIsLoadingMessage={setIsLoadingMessage}
									node={comment}
									nodeType="REVIEW_COMMENT"
									viewerCanDelete={comment.viewerCanDelete}
									setEdit={setEditingComment}
									quote={quote}
									isPending={review.state === "PENDING"}
								/>
							</PRActionIcons>
						</PRThreadedCommentHeader>
						{editingComments[comment.id] ? (
							<PullRequestEditingComment
								pr={pr}
								setIsLoadingMessage={setIsLoadingMessage}
								id={comment.id}
								isPending={comment.state === "PENDING"}
								type={"REVIEW_COMMENT"}
								text={pendingComments[comment.id]}
								done={() => doneEditingComment(comment.id)}
							/>
						) : (
							<>
								<MarkdownText
									text={
										comment.bodyHTML
											? comment.bodyHTML
											: comment.bodyHtml
											? comment.bodyHtml
											: comment.bodyText
									}
									isHtml={comment.bodyHTML || comment.bodyHtml ? true : false}
									inline
								/>
								<div style={{ marginTop: "10px" }}>
									<CodeBlockContainerIcons>
										<div>
											<Icon name="git-branch" />
											<PRBranchContainer>{pr.baseRefName}</PRBranchContainer>
										</div>
										<div style={{ marginLeft: "auto" }}>
											<span onClick={handleDiffClick}>
												<Icon
													name="diff"
													title="Open Diff in IDE"
													placement="bottom"
													className="clickable"
												/>
											</span>
										</div>
										<div style={{ marginLeft: "5px" }}>
											{/* @TODO FIX HREF PATH WITH ${filename} */}

											{pr && pr.url && (
												<Link
													href={pr.url.replace(/\/pull\/\d+$/, `/blob/${pr.headRefOid}/filename}`)}
												>
													<span style={{ color: "var(--text-color-subtle)" }}>
														<Icon
															title="Open File on Remote"
															placement="bottom"
															name="link-external"
															className="clickable"
														/>
													</span>
												</Link>
											)}
										</div>
									</CodeBlockContainerIcons>
									{codeBlock()}
								</div>
							</>
						)}
					</>
				)}
			</PRCodeCommentBody>
			<PullRequestReactions
				pr={pr}
				targetId={comment.id}
				setIsLoadingMessage={setIsLoadingMessage}
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
								<PRHeadshot key={c.id + i} size={30} person={c.author || GHOST} />
								<PRThreadedCommentHeader>
									<b>{(c.author || GHOST).login}</b>
									<Timestamp time={c.createdAt} relative />
									{c.includesCreatedEdit ? <> • edited</> : ""}
									<PRActionIcons>
										<PRAuthorBadges pr={pr} node={c} />
										<PullRequestReactButton
											pr={pr}
											targetId={c.id}
											setIsLoadingMessage={setIsLoadingMessage}
											reactionGroups={c.reactionGroups}
										/>
										<PullRequestCommentMenu
											pr={pr}
											setIsLoadingMessage={setIsLoadingMessage}
											node={c}
											nodeType="REVIEW_COMMENT"
											viewerCanDelete={c.viewerCanDelete}
											setEdit={setEditingComment}
											quote={quote}
											isPending={review.state === "PENDING"}
										/>
									</PRActionIcons>
								</PRThreadedCommentHeader>
								{editingComments[c.id] ? (
									<PullRequestEditingComment
										pr={pr}
										setIsLoadingMessage={setIsLoadingMessage}
										id={c.id}
										isPending={c.state === "PENDING"}
										type={"REVIEW_COMMENT"}
										text={pendingComments[c.id]}
										done={() => doneEditingComment(c.id)}
									/>
								) : (
									<MarkdownText
										text={c.bodyHTML ? c.bodyHTML : c.bodyHtml ? c.bodyHtml : c.bodyText}
										isHtml={c.bodyHTML || c.bodyHtml ? true : false}
										inline
									/>
								)}
							</PRCodeCommentBody>
							<PullRequestReactions
								pr={pr}
								targetId={c.id}
								setIsLoadingMessage={setIsLoadingMessage}
								reactionGroups={c.reactionGroups}
							/>
						</div>
					);
				})}
			{review.state !== "PENDING" && (
				<PRButtonRow className="align-left">
					{/* 
						GitHub doesn't allow replies on existing comments
						when there is a pending review 
					*/}
					{pr.providerId.includes("gitlab") ||
						(!pr.pendingReview && (
							<>
								<PullRequestReplyComment
									pr={pr}
									mode={props.mode}
									/* GitLab-specific */
									parentId={comment?.discussion?.id}
									databaseId={comment.databaseId}
									isOpen={openComments[comment.databaseId]}
									__onDidRender={__onDidRender}
									alwaysOpen={true}
								>
									{comment.isResolved && comment.viewerCanUnresolve && (
										<Button
											variant="secondary"
											isLoading={isResolving}
											onClick={e => handleUnresolve(e, comment.threadId)}
											style={{ marginRight: "10px " }}
										>
											Unresolve
										</Button>
									)}
									{!comment.isResolved && comment.viewerCanResolve && (
										<Button
											variant="secondary"
											isLoading={isResolving}
											onClick={e => handleResolve(e, comment.threadId)}
											style={{ marginRight: "10px " }}
										>
											Resolve
										</Button>
									)}
								</PullRequestReplyComment>
							</>
						))}
				</PRButtonRow>
			)}
		</PRCodeCommentWrapper>
	);
};
