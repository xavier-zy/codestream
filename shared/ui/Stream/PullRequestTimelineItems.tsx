import {
	PRComment,
	PRCommentCard,
	PRCommentHeader,
	PRAuthor,
	PRActionIcons,
	PRCommentBody,
	PRCommit
} from "./PullRequestComponents";
import React, { PropsWithChildren } from "react";
import { PRHeadshot } from "../src/components/Headshot";
import Timestamp from "./Timestamp";
import Icon from "./Icon";
import { MarkdownText } from "./MarkdownText";
import { FetchThirdPartyPullRequestPullRequest } from "@codestream/protocols/agent";

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
							<PRCommit key={index}>
								<Icon name="git-commit" />
								<PRHeadshot key={index} size={16} person={item.actor} />
								<div className="monospace ellipsis">{item.actor.login} requested a review</div>
							</PRCommit>
						);
					}
					case "PullRequestCommit":
						return (
							<PRCommit key={index}>
								<Icon name="git-commit" />
								<PRHeadshot key={index} size={16} person={item.commit.author} />
								<div className="monospace ellipsis">
									<MarkdownText text={item.commit.message || ""} />
								</div>
								<div className="monospace sha">{item.commit.abbreviatedOid}</div>
							</PRCommit>
						);
					case "AssignedEvent": {
						return (
							<PRCommit key={index}>
								<Icon name="review" />
								<PRHeadshot key={index} size={16} person={item.actor} />
								<div className="monospace ellipsis">
									<span>
										{item.actor.login} assigned this to {item.assignee.login}
									</span>
								</div>
							</PRCommit>
						);
					}
					case "LabeledEvent":
						return null;
					case "UnlabeledEvent":
						return null;
					case "ReviewRequestedEvent":
						return null;
					case "RenamedTitleEvent":
						return null;
					case "MergedEvent":
						return null;
					// case "foot":
					// 	return <PRFoot />;
					// case "system":
					// 	return (
					// 		<PRSystem>
					// 			<MarkdownText text={item.body || ""} />
					// 		</PRSystem>
					// 	);
					default:
						return null;
				}
			})}
		</div>
	);
};
