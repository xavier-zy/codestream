import React, { useState } from "react";
import { useSelector } from "react-redux";
import { CodeStreamState } from "../store";
import Icon from "./Icon";
import styled from "styled-components";
import { PRComment, PRCommentCard } from "./PullRequestComponents";
import Tooltip from "./Tooltip";
import { HostApi } from "../webview-api";
import {
	ExecuteThirdPartyTypedType,
	FetchThirdPartyPullRequestPullRequest,
	CreatePullRequestCommentRequest,
	CreatePullRequestCommentAndCloseRequest
} from "@codestream/protocols/agent";
import { Headshot } from "../src/components/Headshot";
import MessageInput from "./MessageInput";
import { CSMe } from "@codestream/protocols/api";
import { ButtonRow } from "./StatusPanel";
import { Button } from "../src/components/Button";

interface Props {
	pr: FetchThirdPartyPullRequestPullRequest;
	setIsLoadingMessage: Function;
	fetch: Function;
	__onDidRender: Function;
	className?: string;
}

export const PullRequestBottomComment = styled((props: Props) => {
	const { pr, fetch, setIsLoadingMessage } = props;
	const derivedState = useSelector((state: CodeStreamState) => {
		const currentUser = state.users[state.session.userId!] as CSMe;
		return { currentUser, currentPullRequestId: state.context.currentPullRequestId };
	});

	const [text, setText] = useState("");
	const [isLoadingComment, setIsLoadingComment] = useState(false);
	const [isLoadingCommentAndClose, setIsLoadingCommentAndClose] = useState(false);

	const trackComment = type => {
		HostApi.instance.track("PR Comment Added", {
			Host: pr.providerId,
			"Comment Type": type,
			"Started Review": false
		});
	};

	const onCommentClick = async (event?: React.SyntheticEvent) => {
		setIsLoadingComment(true);
		trackComment("Comment");
		await HostApi.instance.send(
			new ExecuteThirdPartyTypedType<CreatePullRequestCommentRequest, any>(),
			{
				method: "createPullRequestComment",
				providerId: pr.providerId,
				params: {
					pullRequestId: derivedState.currentPullRequestId!,
					text: text
				}
			}
		);
		setText("");
		fetch().then(() => setIsLoadingComment(false));
	};

	const onCommentAndCloseClick = async e => {
		setIsLoadingMessage("Closing...");
		setIsLoadingCommentAndClose(true);
		trackComment("Comment and Close");
		await HostApi.instance.send(
			new ExecuteThirdPartyTypedType<CreatePullRequestCommentAndCloseRequest, any>(),
			{
				method: "createPullRequestCommentAndClose",
				providerId: pr.providerId,
				params: {
					pullRequestId: derivedState.currentPullRequestId!,
					text: text
				}
			}
		);
		setText("");
		fetch().then(() => setIsLoadingCommentAndClose(false));
	};

	const onCommentAndReopenClick = async e => {
		setIsLoadingMessage("Reopening...");
		setIsLoadingCommentAndClose(true);
		trackComment("Comment and Reopen");
		await HostApi.instance.send(
			new ExecuteThirdPartyTypedType<CreatePullRequestCommentAndCloseRequest, any>(),
			{
				method: "createPullRequestCommentAndReopen",
				providerId: pr.providerId,
				params: {
					pullRequestId: derivedState.currentPullRequestId!,
					text: text
				}
			}
		);
		setText("");
		fetch().then(() => setIsLoadingCommentAndClose(false));
	};

	const map = {
		OFF_TOPIC: "off-topic",
		SPAM: "spam",
		TOO_HEATED: "too heated",
		RESOLVED: "resolved"
	};

	return (
		<PRComment>
			<Headshot size={40} person={derivedState.currentUser}></Headshot>
			<PRCommentCard className="add-comment">
				{pr.locked ? (
					<>
						This conversation has been locked{" "}
						{map[pr.activeLockReason] ? (
							<>
								as <b>{map[pr.activeLockReason]}</b>
							</>
						) : (
							""
						)}{" "}
						and limited to collaborators
					</>
				) : (
					<>
						<div style={{ margin: "5px 0 0 0", border: "1px solid var(--base-border-color)" }}>
							<MessageInput
								multiCompose
								text={text}
								placeholder="Add Comment..."
								onChange={setText}
								onSubmit={onCommentClick}
								__onDidRender={stuff => props.__onDidRender(stuff)}
							/>
						</div>
						<ButtonRow>
							{pr.state === "CLOSED" ? (
								<div style={{ textAlign: "right", flexGrow: 1 }}>
									<Button
										disabled={pr.merged}
										isLoading={isLoadingCommentAndClose}
										onClick={onCommentAndReopenClick}
										variant="secondary"
									>
										{text ? "Reopen and comment" : "Reopen pull request"}
									</Button>

									<Tooltip
										title={
											<span>
												Submit Comment
												<span className="keybinding extra-pad">
													{navigator.appVersion.includes("Macintosh") ? "⌘" : "Alt"} ENTER
												</span>
											</span>
										}
										placement="bottomRight"
										delay={1}
									>
										<Button isLoading={isLoadingComment} onClick={onCommentClick} disabled={!text}>
											Comment
										</Button>
									</Tooltip>
								</div>
							) : (
								<div style={{ textAlign: "right", flexGrow: 1 }}>
									{!pr.merged && (
										<Button
											isLoading={isLoadingCommentAndClose}
											onClick={onCommentAndCloseClick}
											variant="secondary"
										>
											<Icon name="issue-closed" className="red-color margin-right" />
											{text ? "Close and comment" : "Close pull request"}
										</Button>
									)}
									<Tooltip
										title={
											<span>
												Submit Comment
												<span className="keybinding extra-pad">
													{navigator.appVersion.includes("Macintosh") ? "⌘" : "Alt"} ENTER
												</span>
											</span>
										}
										placement="bottomRight"
										delay={1}
									>
										<Button isLoading={isLoadingComment} onClick={onCommentClick} disabled={!text}>
											Comment
										</Button>
									</Tooltip>
								</div>
							)}
						</ButtonRow>
					</>
				)}
			</PRCommentCard>
		</PRComment>
	);
})``;
