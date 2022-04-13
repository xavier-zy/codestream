import React, { useEffect, useState, useCallback, useMemo } from "react";
import styled from "styled-components";
import { ChangesetFile } from "./Review/ChangesetFile";
import Icon from "./Icon";

export const FileWithComments = styled.div`
	cursor: pointer;
	padding: 2px 0;
	margin: 0 !important;
`;

export const Comment = styled.div`
	cursor: pointer;
	margin: 0 !important;
	overflow: hidden;
	text-overflow: ellipsis;
	width: calc(100%);
	white-space: nowrap;
	&:hover {
		background: var(--app-background-color-hover);
		color: var(--text-color-highlight);
	}
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
		viewMode,
		commentMap,
		icon,
		iconClass,
		index,
		fileObject,
		isDisabled,
		loading,
		unVisitFile,
		visitFile,
		goDiff,
		depth,
		visited,
		filesChanged
	} = props;

	const [showComments, setShowComments] = React.useState(false);

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
				rightLine = parseInt(matches[2]) - 1;
			}
		});

		if (rightLine) {
			return rightLine + diffHunkNewLineLength;
		} else {
			return "";
		}
	};

	const handleIconClick = e => {
		e.preventDefault();
		e.stopPropagation();
		if (visited) {
			unVisitFile(fileObject.file);
		} else {
			visitFile(fileObject.file, index);
		}
	};

	if (!hasComments) {
		return (
			<>
				<ChangesetFile
					selected={props.selected}
					viewMode={props.viewMode}
					iconLast={
						isDisabled ? null : (
							<span
								style={{
									margin: "0 10px 0 auto"
								}}
							>
								<Icon onClick={e => handleIconClick(e)} name={icon} className={iconClass} />
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
			</>
		);
	} else {
		// hasComments
		return (
			<>
				<FileWithComments onClick={e => handleClick(e)}>
					<ChangesetFile
						chevron={<Icon name={showComments ? "chevron-down-thin" : "chevron-right-thin"} />}
						selected={selected}
						viewMode={props.viewMode}
						iconLast={
							isDisabled ? null : (
								<span
									style={{
										margin: "0 10px 0 auto"
									}}
								>
									<Icon onClick={e => handleIconClick(e)} name={icon} className={iconClass} />
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
				</FileWithComments>
				{showComments && (
					<>
						{comments.map(c => {
							return (
								<Comment style={depth ? { paddingLeft: `${depth * 10}px` } : {}}>
									{lineNumber(c) && <span>Line {lineNumber(c)}: </span>}
									{c.comment.bodyText}
								</Comment>
							);
						})}
					</>
				)}
			</>
		);
	}
};
