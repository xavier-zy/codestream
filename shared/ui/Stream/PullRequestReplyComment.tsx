import React, { useState } from "react";
import { useSelector } from "react-redux";
import { CodeStreamState } from "../store";
import styled from "styled-components";
import { PRButtonRow, PRCodeCommentReply } from "./PullRequestComponents";
import { HostApi } from "../webview-api";
import {
	ExecuteThirdPartyTypedType,
	FetchThirdPartyPullRequestPullRequest
} from "@codestream/protocols/agent";
import MessageInput from "./MessageInput";
import { CSMe } from "@codestream/protocols/api";
import { Button } from "../src/components/Button";
import { confirmPopup } from "./Confirm";
import { Headshot, PRHeadshot } from "../src/components/Headshot";

interface Props {
	pr: FetchThirdPartyPullRequestPullRequest;
	setIsLoadingMessage: Function;
	fetch: Function;
	className?: string;
	databaseId: string;
	isOpen: boolean;
	__onDidRender: Function;
}

export const PullRequestReplyComment = styled((props: Props) => {
	const { pr, fetch, setIsLoadingMessage, databaseId } = props;
	const derivedState = useSelector((state: CodeStreamState) => {
		const currentUser = state.users[state.session.userId!] as CSMe;
		return { currentUser, currentPullRequestId: state.context.currentPullRequestId };
	});

	const [text, setText] = useState("");
	const [open, setOpen] = useState(props.isOpen);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleComment = async () => {
		try {
			if (text == null || text == "") return;
			setIsSubmitting(true);

			HostApi.instance.track("PR Comment Added", {
				Host: pr.providerId,
				"Comment Type": "Review Reply"
			});

			await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
				method: "createCommentReply",
				providerId: pr.providerId,
				params: {
					pullRequestId: pr.id,
					commentId: databaseId,
					text: text
				}
			});

			fetch().then(() => {
				setText("");
				setOpen(false);
			});
		} catch (ex) {
			console.warn(ex);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleCancelComment = async () => {
		if (text == null || text == undefined || text == "") {
			setOpen(false);
			return;
		}
		if (text.length > 0) {
			confirmPopup({
				title: "Are you sure?",
				message: "",
				centered: true,
				buttons: [
					{ label: "Go Back", className: "control-button" },
					{
						label: "Discard Comment",
						className: "delete",
						wait: true,
						action: () => {
							setText("");
							setOpen(false);
						}
					}
				]
			});
		}
	};

	return (
		<PRCodeCommentReply>
			<PRHeadshot size={30} person={pr.viewer} />

			<div
				style={{
					margin: "0 0 0 40px",
					border: "1px solid var(--base-border-color)"
				}}
				className={open ? "open-comment" : ""}
				onClick={() => setOpen(true)}
			>
				<MessageInput
					multiCompose
					text={text}
					placeholder="Reply..."
					onChange={value => setText(value)}
					onSubmit={handleComment}
					__onDidRender={stuff => props.__onDidRender(stuff)}
				/>
			</div>
			{open && (
				<PRButtonRow>
					<Button variant="secondary" onClick={handleCancelComment}>
						Cancel
					</Button>

					<Button variant="primary" isLoading={isSubmitting} onClick={handleComment}>
						Comment
					</Button>
				</PRButtonRow>
			)}
		</PRCodeCommentReply>
	);
})``;
