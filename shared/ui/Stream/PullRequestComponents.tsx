import { Button } from "../src/components/Button";
import styled from "styled-components";

import { Headshot, PRHeadshot } from "../src/components/Headshot";
import { PRHeadshotName } from "../src/components/HeadshotName";

export const PRHeader = styled.div`
	margin: 20px 20px 0 20px;
`;

export const PRTitle = styled.div`
	font-size: 20px;
	padding-right: 50px;
	a {
		color: var(--text-color);
		opacity: 0.5;
		text-decoration: none;
		&:hover {
			color: var(--text-color-info);
			opacity: 1;
		}
	}
	.cancel-button {
		position: absolute;
		top: 20px;
		right: 20px;
		opacity: 0.7 !important;
		font-size: 11px !important; // to match the spinnable icon
		line-height: 10px !important;
		vertical-align: 3px;
	}
	.reload-button {
		font-size: 11px !important; // to match the spinnable icon
		display: inline-block;
		position: absolute !important;
		top: 20px;
		right: 45px;
		opacity: 0.7;
	}
`;

export const PRStatus = styled.div`
	display: flex;
	width: 100%;
	justify-content: center;
	align-items: center;
	margin: 10px 0 20px 0;
`;

export const PRStatusButton = styled(Button)`
	flex-grow: 0;
	border-radius: 15px;
	margin-right: 10px;
	padding-left: 12px;
	padding-right: 12px;
	.icon {
		margin-right: 5px;
	}
	text-transform: capitalize;
	white-space: nowrap;
`;

export const PRStatusMessage = styled.div`
	flex-grow: 10;
`;

export const PRAuthor = styled.span`
	font-weight: bold;
	padding-right: 5px;
	color: var(--text-color-highlight);
`;

export const PRBranch = styled.span`
	display: inline-block;
	font-family: Menlo, Consolas, "DejaVu Sans Mono", monospace;
	color: var(--text-color-highlight);
`;

export const PRAction = styled.span`
	color: var(--text-color-subtle);
`;

export const PRBadge = styled.span`
	display: inline-block;
	// background: rgba(127, 127, 127, 0.25);
	background: #ddd;
	.vscode-dark & {
		background: #333;
	}
	border-radius: 9px;
	padding: 0 5px;
	min-width: 18px;
	text-align: center;
	margin: 0 5px;
`;

export const PRPlusMinus = styled.div`
	float: right;
	margin-left: auto;
	font-size: smaller;
	.added {
		white-space: nowrap;
		padding-left: 5px;
		color: #66aa66;
	}
	.deleted {
		white-space: nowrap;
		padding-left: 5px;
		color: #cc3366;
	}
`;
export const PRStatusHeadshot = styled.div`
	width: 40px;
	height: 40px;
	position: absolute;
	left: 0;
	top: 0;
	border-radius: 5px;
	display: flex;
	justify-content: center;
	align-items: center;
	flex-shrink: 0;
	.icon {
		transform: scale(2);
		color: white;
	}
`;

export const PRComment = styled.div`
	margin: 30px 0;
	position: relative;
	${PRHeadshot}, ${Headshot} {
		position: absolute;
		left: 0;
		top: 0;
		// div,
		// img {
		// 	border-radius: 50%;
		// }
	}
`;

export const PRCommentCard = styled.div`
	border: 1px solid;
	border-color: var(--base-border-color);
	background: var(--app-background-color);
	.vscode-dark &,
	&.add-comment {
		background: var(--base-background-color);
	}
	border-radius: 5px;
	padding: 10px 15px;
	margin-left: 60px;
	z-index: 2;
	h1 {
		font-size: 15px;
		margin: 0 0 2px 0;
	}
	p {
		margin: 0;
		color: var(--text-color-subtle);
	}
	&:before {
		z-index: 5;
		content: "";
		position: absolute;
		left: 55px;
		top: 15px;
		width: 10px;
		height: 10px;
		transform: rotate(45deg);
		border-left: 1px solid var(--base-border-color);
		border-bottom: 1px solid var(--base-border-color);
		background: var(--base-background-color);
	}
	&.green-border:before {
		border-color: #7aba5d;
	}
`;

export const PRConversation = styled.div`
	position: relative;

	&:before {
		content: "";
		position: absolute;
		left: 71px;
		z-index: 0;
		top: 0;
		height: 100%;
		width: 2px;
		background: var(--base-border-color);
	}
`;

export const PRTimelineItem = styled.div`
	position: relative;
	display: flex;
	margin: 15px 0;
	padding-left: 57px;
	${PRHeadshot} {
		flex-shrink: 0;
		// margin: 0 10px;
		// div,
		// img {
		// 	border-radius: 50%;
		// }
	}

	&.tall {
		margin: 30px 0;
	}
	.sha {
		margin-left: auto;
		padding-left: 10px;
	}
	.cs-tag {
		margin-left: 5px;
		margin-right: 0;
	}
	.icon {
		flex-grow: 0;
		flex-shrink: 0;
		margin-right: 10px;
		background: var(--app-background-color);
		display: flex;
		justify-content: center;
		align-items: center;
		width: 30px;
		height: 18px;
		svg {
			opacity: 0.7;
		}
		&.circled {
			margin-top: -4px;
			height: 30px;
			background: #ddd;
			.vscode-dark & {
				background: #333;
			}
			border-radius: 15px;
			svg {
				opacity: 1;
			}
			border: 3px solid var(--app-background-color);
		}
	}
	.monospace {
		color: var(--text-color-subtle);
	}
`;

export const PRTimelineItemBody = styled.div`
	.left-pad {
		padding-left: 5px;
	}
	${PRHeadshotName} {
		color: var(--text-color-highlight);
		padding-right: 5px;
	}
`;

export const PRContent = styled.div`
	margin: 0 20px 20px 20px;
	display: flex;
	// width: 100%;
	.main-content {
		flex-grow: 10;
	}
	@media only screen and (max-width: 630px) {
		flex-direction: column;
		.main-content {
			order: 2;
			${PRComment} ${PRHeadshot}, 
			${PRComment} ${Headshot}, 
			${PRStatusHeadshot} {
				display: none;
			}
			${PRCommentCard} {
				margin-left: 0;
				&:before {
					display: none;
				}
			}
			${PRConversation}:before {
				left: 11px;
			}
			${PRTimelineItem} {
				padding-left: 0;
				margin-left: -2px;
			}
		}
	}
`;

export const PRSection = styled.div`
	padding: 10px 0;
	position: relative;
	font-size: 12px;
	border-bottom: 1px solid var(--base-border-color);
	color: var(--text-color-subtle);
	h1 {
		font-weight: 600;
		font-size: 12px;
		margin: 0 0 8px 0;
		padding: 0;
		.icon.settings {
			float: right;
			display: inline-block;
			transform: scale(0.7);
			opacity: 0.7;
		}
	}
	button {
		width: 100%;
	}
	a {
		color: var(--text-color-subtle);
		text-decoration: none;
		&:hover {
			color: var(--text-color-info);
		}
	}
`;

export const PRSidebar = styled.div`
	flex-grow: 0;
	display: flex;
	flex-direction: column;
	@media only screen and (max-width: 630px) {
		flex-direction: row;
		flex-wrap: wrap;
		width: auto;
		order: 1;
		margin-left: 0;
		margin-right: 0;
		padding-left: 0;
		padding-top: 0;
		${PRSection} {
			flex: 1 0 0;
			width: 1fr;
			min-width: 150px;
			margin: 0 10px 10px 0;
			margin: 0 -1px -1px 0;
			border: 1px solid var(--base-border-color) !important;
			padding: 5px;
		}
	}
	width: 225px;
	padding-left: 30px;
	a {
		color: var(--text-color-subtle);
		text-decoration: none;
		&:hover {
			color: var(--text-color-info);
		}
	}
`;

export const PRCommentHeader = styled.div`
	padding: 10px 15px 10px 15px;
	margin: -10px -15px 0 -15px;
	border-bottom: 1px solid var(--base-border-color);
	background: var(--base-background-color);
	display: flex;
	align-items: top;
`;

export const PRCommentBody = styled.div`
	padding: 15px 0 5px 0;
`;

// const PRCard = styled.div`
// 	border: 1px solid var(--base-border-color);
// 	background: var(--base-background-color);
// 	margin-left: 60px;
// 	padding: 15px 10px;
// `;

export const PRStatusIcon = styled.div`
	.icon {
		flex-shrink: 0;
		margin: 0 10px;
	}
`;

export const ButtonRow = styled.div`
	display: flex;
	button + button {
		margin-left: 10px;
	}
	button {
		margin-top: 10px;
	}
`;

// const PRSystem = styled.div`
// 	position: relative;
// 	padding: 20px 0 0 0;
// 	margin-left: 60px;
// 	background: var(--app-background-color);
// 	z-index: 3;
// `;

export const PRFoot = styled.div`
	border-top: 4px solid var(--base-border-color);
	background: var(--app-background-color);
	margin-top: 30px;
`;

export const PRActionIcons = styled.div`
	margin-left: auto;
	align-items: top;
	text-align: right;
	.member {
		display: inline-block;
		flex-grow: 0;
		height: auto;
		border: 1px solid var(--base-border-color);
		border-radius: 10px;
		padding: 1px 7px;
		font-size: smaller;
		color: var(--text-color-subtle);
	}
	.icon {
		opacity: 0.5;
		margin-left: 10px;
	}
`;

export const PRIconButton = styled.div`
	display: flex;
	flex-shrink: 0;
	justify-content: center;
	align-items: center;
	width: 30px;
	height: 30px;
	border-radius: 15px;
	.icon {
		color: white;
	}
`;

export const PRButtonRow = styled.div`
	margin: 15px -15px -15px -15px;
	border-top: 1px solid var(--base-border-color);
	border-radius: 0 0 5px 5px;
	padding: 15px;
	background: var(--base-background-color);
	.vscode-dark& {
		background: rgba(0, 0, 0, 0.1);
	}
`;
