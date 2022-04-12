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

//@TODO: better typescript-ify these props
interface Props {
	hasComments?: any;
	selected?: any;
	viewMode?: any;
	commentMap?: any;
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

export const PullRequestFilesChangedFileComments = (props: Props) => {
	const {
		hasComments,
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
				<FileWithComments>
					<ChangesetFile
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
			</>
		);
	}
};

// if (!props.hasComments) {
// 	return (
// 		<>
// 			<ChangesetFile
// 				selected={props.selected}
// 				viewMode={props.viewMode}
// 				iconLast={
// 					isDisabled ? null : (
// 						<span
// 							style={{
// 								margin: "0 10px 0 auto"
// 							}}
// 						>
// 							<Icon
// 								onClick={
// 									visited
// 										? async e => {
// 												e.preventDefault();
// 												e.stopPropagation();
// 												unVisitFile(f.file);
// 										  }
// 										: undefined
// 								}
// 								name={icon}
// 								className={iconClass}
// 							/>
// 						</span>
// 					)
// 				}
// 				noHover={isDisabled || loading}
// 				onClick={
// 					isDisabled || loading
// 						? undefined
// 						: async e => {
// 								e.preventDefault();
// 								goDiff(i);
// 						  }
// 				}
// 				key={i + ":" + f.file}
// 				depth={depth}
// 				{...f}
// 			/>
// 		</>
// 	);
// } else {
// 	// {/* FOR ERIC TOMORROW, break this into its own component its the only way*/}

// 	return (
// 		<>
// 			<FileWithComments onClick={() => props.toggleDirectory("")}>
// 				<ChangesetFile
// 					selected={selected}
// 					viewMode={props.viewMode}
// 					iconLast={
// 						isDisabled ? null : (
// 							<span
// 								style={{
// 									margin: "0 10px 0 auto"
// 								}}
// 							>
// 								<Icon
// 									onClick={
// 										visited
// 											? async e => {
// 													e.preventDefault();
// 													e.stopPropagation();
// 													unVisitFile(f.file);
// 											  }
// 											: undefined
// 									}
// 									name={icon}
// 									className={iconClass}
// 								/>
// 							</span>
// 						)
// 					}
// 					noHover={isDisabled || loading}
// 					onClick={
// 						isDisabled || loading
// 							? undefined
// 							: async e => {
// 									e.preventDefault();
// 									goDiff(i);
// 							  }
// 					}
// 					key={i + ":" + f.file}
// 					depth={depth}
// 					{...f}
// 				/>
// 			</FileWithComments>
// 		</>
// 	);
// }
