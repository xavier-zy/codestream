import {
	PRComment,
	PRCommentCard,
	PRCommentHeader,
	PRAuthor,
	PRActionIcons,
	PRCommentBody,
	PRTimelineItem,
	PRTimelineItemBody,
	PRBranch
} from "./PullRequestComponents";
import React, { PropsWithChildren } from "react";
import { PRHeadshot } from "../src/components/Headshot";
import Timestamp from "./Timestamp";
import Icon from "./Icon";
import { MarkdownText } from "./MarkdownText";
import { FetchThirdPartyPullRequestPullRequest } from "@codestream/protocols/agent";
import Tag from "./Tag";
import { Link } from "./Link";
import { PRHeadshotName } from "../src/components/HeadshotName";

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
										<div>
											<PRAuthor>{item.author.login}</PRAuthor> commented{" "}
											<Timestamp time={item.createdAt!} relative />
										</div>
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
							<PRComment key={index} className="tall">
								<PRHeadshot key={index} size={40} person={item.author} />
								<PRCommentCard>
									<PRCommentHeader>
										<div>
											<PRAuthor>{item.author.login}</PRAuthor> commented{" "}
											<Timestamp time={item.createdAt!} relative />
										</div>
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
							<PRTimelineItem key={index} className="tall">
								<Icon name="review" className="circled" />
								<PRTimelineItemBody>
									<PRHeadshotName key={index} size={16} person={item.actor} />
									requested a review
								</PRTimelineItemBody>
							</PRTimelineItem>
						);
					}
					case "PullRequestCommit":
						return (
							<PRTimelineItem key={index}>
								<Icon name="git-commit" />
								<PRHeadshot key={index} size={16} person={item.commit.author} />

								<PRTimelineItemBody>
									<div className="monospace left-pad">
										<Link
											href={`${pr.url}/commits/${item.commit.abbreviatedOid}`}
											className="monospace"
										>
											<MarkdownText excludeParagraphWrap text={item.commit.message || ""} />
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
						);
					case "AssignedEvent": {
						return (
							<PRTimelineItem key={index} className="tall">
								<Icon name="review" className="circled" />
								<PRTimelineItemBody>
									<PRHeadshotName key={index} size={16} person={item.actor} />
									assigned {item.assignee.login}
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
									<PRHeadshotName key={index} size={16} person={item.actor} />
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
									<PRHeadshotName key={index} size={16} person={item.actor} />
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
									<PRHeadshotName key={index} size={16} person={item.actor} />
									removed
									<Tag tag={{ label: item.label.name, color: `#${item.label.color}` }} />
									<Timestamp time={item.createdAt!} relative />
								</PRTimelineItemBody>
							</PRTimelineItem>
						);
					}
					// case "RenamedTitleEvent":
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
