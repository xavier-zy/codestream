import React, { useEffect, useState, useCallback, useMemo } from "react";
import styled from "styled-components";
import { ChangesetFile } from "./Review/ChangesetFile";
import Icon from "./Icon";

export const FileWithComments = styled.div`
	cursor: pointer;
	padding: 2px 0;
	margin: 0 !important;
	&:hover {
		background: var(--app-background-color-hover);
		color: var(--text-color-highlight);
	}
`;

export const Comment = styled.div`
	cursor: pointer;
	margin: 0 !important;
	padding-left: 112px;
	overflow: hidden;
	text-overflow: ellipsis;
	width: calc(98%);
	white-space: nowrap;
	&:hover {
		background: var(--app-background-color-hover);
		color: var(--text-color-highlight);
	}
`;

//@TODO: better typescript-ify these props
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
	goDiff?: any;
	depth?: any;
	visited?: any;
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
		goDiff,
		depth,
		visited
	} = props;

	const [showComments, setShowComments] = React.useState(false);

	const handleClick = e => {
		e.preventDefault();
		setShowComments(!showComments);
	};

	console.warn("eric comments", comments);

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
								<Icon
									onClick={
										visited
											? async e => {
													e.preventDefault();
													e.stopPropagation();
													unVisitFile(fileObject.file);
											  }
											: undefined
									}
									name={icon}
									className={iconClass}
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
									<Icon
										onClick={
											visited
												? async e => {
														e.preventDefault();
														e.stopPropagation();
														unVisitFile(fileObject.file);
												  }
												: undefined
										}
										name={icon}
										className={iconClass}
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
				</FileWithComments>
				{showComments && (
					<>
						{comments.map(c => {
							return <Comment>{c.comment.bodyText}</Comment>;
						})}
					</>
				)}
			</>
		);
	}
};
