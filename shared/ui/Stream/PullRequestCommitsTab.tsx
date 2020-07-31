import React from "react";
import { isFeatureEnabled } from "../store/apiVersioning/reducer";
import Icon from "./Icon";
import Timestamp from "./Timestamp";
import Tooltip from "./Tooltip";
import { PRHeadshotName } from "../src/components/HeadshotName";
import { markdownify } from "./Markdowner";
import { PRContent } from "./PullRequestComponents";
import styled from "styled-components";
import copy from "copy-to-clipboard";
import { groupBy } from "lodash-es";
import { Link } from "./Link";

const PRCommitContent = styled.div`
	margin: 0 20px 20px 20px;
	position: relative;
	&:before {
		content: "";
		position: absolute;
		left: 11px;
		z-index: 0;
		top: 0;
		height: 100%;
		width: 2px;
		background: var(--base-border-color);
	}
`;

export const PRCommitCard = styled.div`
	position: relative;
	border: 1px solid;
	border-bottom: none;
	border-color: var(--base-border-color);
	background: var(--app-background-color);
	.vscode-dark &,
	&.add-comment {
		background: var(--base-background-color);
	}
	padding: 10px 15px 10px 15px;
	margin-left: 30px;
	z-index: 2;
	width: auto;
	h1 {
		font-size: 15px;
		font-weight: normal;
		margin: 0 0 8px 0;
		padding-right: 120px;
	}
	p {
		margin: 0;
		color: var(--text-color-subtle);
	}
	&:first-child {
		border-radius: 5px 5px 0 0;
	}
	&:last-child {
		border-radius: 0 0 5px 5px;
		border: 1px solid var(--base-border-color);
	}
`;

export const PRCommitDay = styled.div`
	position: relative;
	margin: 20px 0 15px 30px;
	.icon {
		position: absolute !important;
		left: -25px;
		background: var(--app-background-color);
		height: 19px;
		svg {
			opacity: 0.7;
		}
	}
`;

const PRCommitButtons = styled.div`
	position: absolute;
	right: 15px;
	top: 10px;
	.icon {
		display: inline-block;
		margin-left: 10px;
	}
	.icon,
	a {
		opacity: 0.7;
		color: var(--text-color);
		text-decoration: none;
		&:hover {
			opacity: 1;
			color: var(--text-color-info);
		}
	}
`;

export const PullRequestCommitsTab = props => {
	const { pr, ghRepo } = props;

	const byDay = groupBy(pr.commits.nodes, _ => {
		return new Intl.DateTimeFormat("en", {
			day: "numeric",
			month: "short",
			year: "numeric"
		}).format(new Date(_.commit.authoredDate).getTime());
	});

	return (
		<PRCommitContent>
			{Object.keys(byDay).map(day => {
				return (
					<>
						<PRCommitDay>
							<Icon name="git-commit" />
							Commits on {day}
						</PRCommitDay>
						<div>
							{byDay[day].map(_ => {
								return (
									<PRCommitCard>
										<h1>{_.commit.message}</h1>
										<PRHeadshotName person={_.commit.author} />
										<span className="subtle">committed</span>
										<Timestamp time={_.commit.authoredDate} relative />
										<PRCommitButtons>
											<Tooltip title="View commit on GitHub" placement="bottom">
												<span>
													<Link
														href={`${pr.url}/commits/${_.commit.abbreviatedOid}`}
														className="monospace"
													>
														{_.commit.abbreviatedOid}
													</Link>
												</span>
											</Tooltip>
											<Icon
												title="Copy Sha"
												placement="bottom"
												name="copy"
												className="clickable"
												onClick={() => copy(_.commit.abbreviatedOid)}
											/>
											<Link
												href={pr.url.replace(/\/pull\/\d+$/, `/tree/${_.commit.abbreviatedOid}`)}
											>
												<Icon
													title="Browse the repository at this point in the history on GitHub"
													className="clickable"
													placement="bottomRight"
													name="code"
												/>
											</Link>
										</PRCommitButtons>
									</PRCommitCard>
								);
							})}
						</div>
					</>
				);
			})}
		</PRCommitContent>
	);
};
