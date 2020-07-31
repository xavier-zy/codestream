import {
	PRComment,
	PRCommentCard,
	PRCommentHeader,
	PRAuthor,
	PRActionIcons,
	PRCommentBody,
	PRTimelineItem
} from "./PullRequestComponents";
import React, { PropsWithChildren } from "react";
import { PRHeadshot } from "../src/components/Headshot";
import Timestamp from "./Timestamp";
import Icon from "./Icon";
import { MarkdownText } from "./MarkdownText";
import { FetchThirdPartyPullRequestPullRequest } from "@codestream/protocols/agent";
import Tag from "./Tag";
import { Link } from "./Link";

interface Props {
	pr: FetchThirdPartyPullRequestPullRequest;
}
export const PullRequestTimelineItems = (props: PropsWithChildren<Props>) => {
	const pr = props.pr;
	if (!pr || !pr.timelineItems) return null;

	return (
		<div>
			{pr.timelineItems.nodes.map((item, index) => {
				switch (item.__typename) {
					case "IssueComment":
						return (
							<PRComment key={index}>
								<PRHeadshot key={index} size={40} person={item.author} />
								<PRCommentCard>
									<PRCommentHeader>
										<PRAuthor>{item.author.login}</PRAuthor> commented{" "}
										<Timestamp time={item.createdAt!} relative />
										<PRActionIcons>
											<div className="member">Member</div>
											<Icon name="smiley" />
											<Icon name="kebab-horizontal" />
										</PRActionIcons>
									</PRCommentHeader>
									<PRCommentBody>{item.bodyText}</PRCommentBody>
								</PRCommentCard>
							</PRComment>
						);
					case "PullRequestReview": {
						return (
							<PRComment key={index}>
								<PRHeadshot key={index} size={40} person={item.author} />
								<PRCommentCard>
									<PRCommentHeader>
										<PRAuthor>{item.author.login}</PRAuthor> commented{" "}
										<Timestamp time={item.createdAt!} relative />
										<PRActionIcons>
											<div className="member">Member</div>
											<Icon name="smiley" />
											<Icon name="kebab-horizontal" />
										</PRActionIcons>
									</PRCommentHeader>
									<PRCommentBody>
										{item.bodyText}
										{item.comments &&
											item.comments.nodes &&
											item.comments.nodes.map(_ => {
												return (
													<>
														<div>
															{_.diffHunk.split("\n").map(h => (
																<div className="monospace">{h}</div>
															))}
														</div>
														<br />
														{_.bodyText}
													</>
												);
											})}
									</PRCommentBody>
								</PRCommentCard>
							</PRComment>
						);
					}
					case "ReviewRequestedEvent": {
						return (
							<PRTimelineItem key={index}>
								<Icon name="review" />
								<PRHeadshot key={index} size={16} person={item.actor} />
								<div className="monospace ellipsis">{item.actor.login} requested a review</div>
							</PRTimelineItem>
						);
					}
					case "PullRequestCommit":
						return (
							<PRTimelineItem key={index}>
								<Icon name="git-commit" />
								<PRHeadshot key={index} size={16} person={item.commit.author} />

								<div className="monospace ellipsis">
									<Link
										href={`${pr.url}/commits/${item.commit.abbreviatedOid}`}
										className="monospace"
									>
										<MarkdownText text={item.commit.message || ""} />
									</Link>
								</div>
								<div className="monospace sha">
									<Link
										href={`${pr.url}/commits/${item.commit.abbreviatedOid}`}
										className="monospace"
									>
										{item.commit.abbreviatedOid}
									</Link>
								</div>
							</PRTimelineItem>
						);
					case "AssignedEvent": {
						return (
							<PRTimelineItem key={index}>
								<Icon name="review" />
								<PRHeadshot key={index} size={16} person={item.actor} />
								<div className="monospace ellipsis">
									<span>
										{item.actor.login} assigned {item.assignee.login}
										<Timestamp time={item.createdAt!} relative />
									</span>
								</div>
							</PRTimelineItem>
						);
					}
					case "MergedEvent": {
						return (
							<PRTimelineItem key={index}>
								<Icon name="git-merge" />
								<PRHeadshot key={index} size={16} person={item.actor} />
								<div className="monospace ellipsis">
									<span>
										{item.actor.login} merged commit {item.commit.abbreviatedOid} into{" "}
										{item.mergeRefName}
										<Timestamp time={item.createdAt!} relative />
									</span>
								</div>
							</PRTimelineItem>
						);
					}
					case "LabeledEvent": {
						return (
							<PRTimelineItem key={index} className="tall">
								<Icon name="tag" className="circled" />
								<PRHeadshot key={index} size={16} person={item.actor} />
								<span>
									{item.actor.login} added
									<Tag tag={{ label: item.label.name, color: `#${item.label.color}` }} />
									<Timestamp time={item.createdAt!} relative />
								</span>
							</PRTimelineItem>
						);
					}
					// 	return null;
					// case "UnlabeledEvent":
					// 	return null;
					// case "ReviewRequestedEvent":
					// 	return null;
					// case "RenamedTitleEvent":
					// 	return null;
					// case "MergedEvent":
					// 	return null;
					default: {
						console.warn(`timelineItem not found: ${item.__typename} item is: `, item);
						return null;
					}
				}
			})}
		</div>
	);
};
