import React, { useEffect } from "react";
import { useDispatch } from "react-redux";
import styled from "styled-components";
import { ChangesetFile } from "./Review/ChangesetFile";
import Icon from "./Icon";
import { setCurrentPullRequest } from "../store/context/actions";
import { openModal } from "../store/context/actions";
import { WebviewModals } from "../ipc/webview.protocol.common";
import { orderBy } from "lodash-es";
import { api } from "../store/providerPullRequests/actions";
import { find, isNil } from "lodash-es";
import { useDidMount } from "../utilities/hooks";

export const FileWithComments = styled.div`
	cursor: pointer;
	margin: 0 !important;
`;

export const Comment = styled.div`
	cursor: pointer;
	margin: 0 !important;
	padding: 2px 0 2px 0;
	overflow: hidden;
	text-overflow: ellipsis;
	width: calc(100%);
	white-space: nowrap;
	&:hover {
		background: var(--app-background-color-hover);
		color: var(--text-color-highlight);
	}
`;

export const PendingCircle = styled.div`
	margin-left: auto;
	color: #bf8700;
	border-radius: 50%;
	border: 1px solid #bf8700;
	width: 17px;
	height: 16px;
	text-align: center;
	margin-right: 13px;
	font-size: 10px;
`;

//@TODO: better typescript-ify this interface
interface Props {
	hasComments?: any;
	selected?: any;
	viewMode?: any;
	commentMap?: any;
	comments?: any;
	icon?: any;
	iconClass?: any;
	index?: any;
	fileObject?: any;
	isDisabled?: any;
	loading?: any;
	unVisitFile?: any;
	visitFile?: any;
	goDiff?: any;
	depth?: any;
	visited?: any;
	filesChanged?: any;
	pullRequest?: any;
	cardIndex?: any;
}

/**
 * File line in PR sidebar, shows comments if available
 *
 * @param props
 * @returns jsx
 */
export const PullRequestFilesChangedFileComments = (props: Props) => {
	const {
		hasComments,
		comments,
		selected,
		index,
		fileObject,
		isDisabled,
		loading,
		goDiff,
		depth,
		pullRequest,
		//these props will go away if we ever get a gitlab graphql mutation
		//for marking files as viewed, for the timebeing we need them
		icon,
		iconClass,
		unVisitFile,
		visitFile,
		visited
	} = props;

	const dispatch = useDispatch();
	const [showComments, setShowComments] = React.useState(true);
	const [showCheckIcon, setShowCheckIcon] = React.useState(false);
	const [isChecked, setIsChecked] = React.useState(false);
	const [iconName, setIconName] = React.useState("sync");
	const isGitLab = pullRequest.providerId.includes("gitlab");

	// Sync our visited state with whats on github
	useDidMount(() => {
		syncCheckedStatusWithPr();
	});

	useEffect(() => {
		syncCheckedStatusWithPr();
	}, [pullRequest]);

	useEffect(() => {
		let iconName;

		if (isChecked) {
			iconName = "ok";
		} else {
			iconName = "circle";
		}

		setIconName(iconName);
	}, [isChecked]);

	const syncCheckedStatusWithPr = () => {
		const prFiles = pullRequest.files.nodes;
		const currentFilepath = fileObject.file;

		const prFile = prFiles.find(pr => pr.path === currentFilepath);
		const isVisitedCheck = prFile.viewerViewedState === "VIEWED";

		if (isVisitedCheck) {
			visitAndCheckFile();
		} else {
			unvisitAndUncheckFile();
		}
	};

	const visitAndCheckFile = async () => {
		await dispatch(
			api("markFileAsViewed", {
				onOff: true,
				path: fileObject.file
			})
		);
		setIsChecked(true);
	};

	const unvisitAndUncheckFile = async () => {
		await dispatch(
			api("markFileAsViewed", {
				onOff: false,
				path: fileObject.file
			})
		);
		setIsChecked(false);
	};

	const handleIconClick = event => {
		event.preventDefault();
		event.stopPropagation();

		if (loading) {
			return;
		}

		if (isChecked) {
			unvisitAndUncheckFile();
			unVisitFile(fileObject.file);
		} else {
			visitAndCheckFile();
			visitFile(fileObject.file, index);
		}
	};

	const handleClick = e => {
		e.preventDefault();
		setShowComments(!showComments);
	};

	/**
	 * Github/lab makes it difficult to find a comment line number, so we have to
	 * parse the diffHunk and do some basic math
	 * @param commentObject
	 * @returns string lineNumber
	 */
	const lineNumber = commentObject => {
		// With git, the "line number" is actually 2 numbers, left and right
		// For now, we are going to base it off of the right number, subject to change.
		// let leftLine = 0;
		let rightLine = 0;

		if (!commentObject?.comment || !commentObject?.review) {
			return "";
		}

		let diffHunk = commentObject.comment?.diffHunk || commentObject.review?.diffHunk || "";
		let diffHunkNewLineLength = diffHunk.split("\n").length - 1;

		diffHunk.split("\n").map(d => {
			const matches = d.match(/@@ \-(\d+).*? \+(\d+)/);
			if (matches) {
				// leftLine = parseInt(matches[1], 10) - 1;
				rightLine = parseInt(matches[2]);
			}
		});

		if (rightLine) {
			return rightLine + diffHunkNewLineLength;
		} else {
			return "";
		}
	};

	const handleCommentClick = (event, comment) => {
		event.preventDefault();
		event.stopPropagation();

		dispatch(
			setCurrentPullRequest(
				pullRequest.providerId,
				pullRequest.id,
				comment?.comment?.id || comment?.review?.id,
				"",
				"details"
			)
		);
	};

	const handlePendingClick = event => {
		event.preventDefault();
		event.stopPropagation();
		dispatch(openModal(WebviewModals.FinishReview));
	};

	const handleMouseEnter = event => {
		event.preventDefault();
		event.stopPropagation();
		setShowCheckIcon(true);
	};

	const handleMouseLeave = event => {
		event.preventDefault();
		event.stopPropagation();
		setShowCheckIcon(false);
	};

	let commentsSortedByLineNumber;
	if (hasComments) {
		commentsSortedByLineNumber = orderBy(
			comments,
			["asc", "comment.position"],
			//@ts-ignore
			["asc", "comment.bodyText"]
		);
	}
	//@TODO: define these on mount, hook, and/or state so we don't do the
	//		 calculation every re-render.
	const displayIcon = isGitLab ? icon : iconName;
	const iconIsFlex = showCheckIcon || displayIcon === "ok";

	if (!hasComments) {
		return (
			<div onMouseEnter={e => handleMouseEnter(e)} onMouseLeave={e => handleMouseLeave(e)}>
				<ChangesetFile
					selected={props.selected}
					viewMode={props.viewMode}
					iconLast={
						isDisabled ? null : (
							<span
								style={{
									margin: "0 10px 0 auto",
									display: showCheckIcon || displayIcon === "ok" ? "flex" : "none"
								}}
							>
								<Icon
									onClick={e => handleIconClick(e)}
									name={displayIcon}
									className={"file-icon"}
								/>
							</span>
						)
					}
					noHover={isDisabled || loading}
					onClick={
						isDisabled || loading
							? undefined
							: async e => {
									e.preventDefault();
									goDiff(index);
							  }
					}
					key={index + ":" + fileObject.file}
					depth={depth}
					{...fileObject}
				/>
			</div>
		);
	} else {
		// hasComments
		return (
			<div onMouseEnter={e => handleMouseEnter(e)} onMouseLeave={e => handleMouseLeave(e)}>
				<FileWithComments onClick={e => handleClick(e)}>
					<ChangesetFile
						chevron={<Icon name={showComments ? "chevron-down-thin" : "chevron-right-thin"} />}
						selected={selected}
						viewMode={props.viewMode}
						count={
							<div style={{ margin: "0 14px 0 auto", display: "flex" }}>
								{comments.length === 0 || showComments ? null : (
									<span style={{ margin: "0 0 0 -5px" }} className={`badge`}>
										{comments.length}
									</span>
								)}
							</div>
						}
						iconLast={
							isDisabled ? null : (
								<>
									{iconIsFlex && (
										<span
											style={{
												display: "flex"
											}}
										>
											<Icon
												onClick={e => handleIconClick(e)}
												name={displayIcon}
												className={"file-icon"}
											/>
										</span>
									)}
									{!iconIsFlex && (
										<span
											style={{
												width: "19px",
												display: "flex"
											}}
										>
											{" "}
										</span>
									)}
								</>
							)
						}
						noHover={isDisabled || loading}
						onClick={
							isDisabled || loading
								? undefined
								: async e => {
										e.preventDefault();
										goDiff(index);
								  }
						}
						key={index + ":" + fileObject.file}
						depth={depth}
						{...fileObject}
					/>
				</FileWithComments>
				{showComments && (
					<>
						{commentsSortedByLineNumber.map((c, index) => {
							const isPending = c.comment.state === "PENDING";
							return (
								<Comment
									onClick={e => handleCommentClick(e, c)}
									style={depth ? { paddingLeft: `${depth * 12}px` } : {}}
									key={`comment_${c.comment.id}_${index}`}
								>
									<div style={{ display: "flex" }}>
										<div
											style={{
												overflow: "hidden",
												textOverflow: "ellipsis",
												width: "calc(100%)",
												whiteSpace: "nowrap"
											}}
										>
											<Icon name="comment" className="type-icon" />{" "}
											{lineNumber(c) && <span>Line {lineNumber(c)}: </span>}
											{c.comment.bodyText}
										</div>
										{isPending && (
											<PendingCircle onClick={e => handlePendingClick(e)}>P</PendingCircle>
										)}
									</div>
								</Comment>
							);
						})}
					</>
				)}
			</div>
		);
	}
};
