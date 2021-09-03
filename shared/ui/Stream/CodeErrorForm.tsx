import React, { useState, useEffect } from "react";
import { Content } from "../src/components/Carousel";
import styled from "styled-components";
import { PanelHeader } from "../src/components/PanelHeader";
import { useDispatch, useSelector } from "react-redux";
import { useDidMount } from "../utilities/hooks";
import { Dialog } from "../src/components/Dialog";
import { CSCodeError, CSMe } from "@codestream/protocols/api";
import cx from "classnames";
import { closePanel, createPostAndCodeError } from "./actions";
import { CodeStreamState } from "../store";
import { confirmPopup } from "./Confirm";
import Icon from "./Icon";
import { Headshot } from "@codestream/webview/src/components/Headshot";
import CancelButton from "./CancelButton";
import Button from "./Button";
import MessageInput from "./MessageInput";
import {
	NewCodeErrorAttributes,
	resolveStackTrace,
	jumpToStackLine
} from "../store/codeErrors/actions";

const Root = styled.div`
	color: var(--text-color);
	position: relative;
	h2,
	h3 {
		color: var(--text-color-highlight);
	}

	h3 {
		margin: 30px 0 5px 0;
		.icon {
			margin-right: 5px;
			vertical-align: -2px;
		}
	}
`;

interface StackCall {
	path?: string;
	file?: string;
	line?: number;
	char?: number;
}

interface StackInfo {
	title?: string;
	calls: StackCall[];
}

interface Props {
	codeErrorId?: string;
	editingCodeError?: CSCodeError;
	isEditing?: boolean;
}

const parseStack = (stack: string[]): StackInfo => {
	const stackInfo: StackInfo = { calls: [] };
	if (stack[0] && stack[0].startsWith("Error: ")) {
		stackInfo.title = (stack[0] as string).substring(7);
	}
	return stackInfo;
};

export const CodeErrorForm = (props: Props = {}) => {
	const rootRef = React.useRef(null);
	const dispatch = useDispatch();

	const derivedState = useSelector((state: CodeStreamState) => {
		const { users, context, session, codeErrors } = state;
		const currentUser = users[session.userId!] as CSMe;
		const { errorsInboxOptions = {} } = context;
		const codeError =
			props.editingCodeError || (props.codeErrorId && codeErrors[props.codeErrorId]);
		const stack = codeError?.stackTrace || errorsInboxOptions.stack;
		const url = codeError?.providerUrl;
		const { customAttributes } = errorsInboxOptions;
		const parsedStack: string[] = stack ? JSON.parse(stack) : [];
		const stackInfo = stack ? parseStack(parsedStack) : { calls: [] };
		const attrs = customAttributes ? JSON.parse(customAttributes) : {};

		return {
			currentUser,
			stack,
			parsedStack,
			stackInfo,
			customAttributes: attrs,
			codeError,
			url
		};
	});

	const [title, setTitle] = useState(derivedState.stackInfo.title || "");
	const [titleTouched, setTitleTouched] = useState(false);
	const [replyText, setReplyText] = useState("");
	const [replyTextTouched, setReplyTextTouched] = useState(false);
	const [resolvedStackPromise, setResolvedStackPromise] = useState<Promise<any> | undefined>(
		undefined
	);

	const cancelTip = (
		<span>
			{"Discard"}
			<span className="keybinding extra-pad">ESC</span>
		</span>
	);

	const confirmCancel = () => {
		const finish = () => {
			dispatch(closePanel());
		};

		// if the user has made any changes in the form, confirm before closing
		if (titleTouched || replyTextTouched) {
			confirmPopup({
				title: "Are you sure?",
				message: "Changes will not be saved.",
				centered: true,
				buttons: [
					{ label: "Go Back", className: "control-button" },
					{
						label: "Discard Code Error",
						wait: true,
						action: () => finish(),
						className: "delete"
					}
				]
			});
		} else {
			finish();
		}
	};

	const { stack, parsedStack, customAttributes, currentUser, url, stackInfo } = derivedState;
	const { repo, branch, sha } = customAttributes;

	useDidMount(() => {
		if (repo && sha) {
			// TODO fix me
			setResolvedStackPromise(resolveStackTrace(repo, sha, "FIXME", parsedStack));
		}
	});

	useEffect(() => {
		// jump to first line of stack (the line that generated the error) when we've got the stack data
		if (!resolvedStackPromise) return;
		(async function() {
			const resolvedStack = await resolvedStackPromise;
			if (resolvedStack && !resolvedStack.error) {
				let lineNum = 0;
				const len = resolvedStack.lines.length;
				while (lineNum < len && resolvedStack.lines[lineNum].line !== undefined) {
					lineNum++;
				}
				if (lineNum < len) {
					dispatch(jumpToStackLine(resolvedStack.lines[lineNum], sha, ""));
				}
			}
		})();
	}, [resolvedStackPromise]);

	const onClickStackLine = async (event, lineNum) => {
		event && event.preventDefault();
		const resolvedStack = await resolvedStackPromise;
		if (!resolvedStack.error && resolvedStack.lines[lineNum].line !== undefined) {
			dispatch(jumpToStackLine(resolvedStack.lines[lineNum], sha, ""));
		}
	};

	const onSubmit = async (event?: React.SyntheticEvent) => {
		event && event.preventDefault();

		const stackInfo = await resolvedStackPromise;
		const codeError: NewCodeErrorAttributes = {
			accountId: derivedState.codeError.accountId,
			objectId: derivedState.codeError.objectId,
			objectType: derivedState.codeError.objectType,
			objectInfo: derivedState.codeError.objectInfo,
			title,
			stackTraces: [stackInfo],
			providerUrl: url
		};
		if (replyText) {
			codeError.replyPost = { text: replyText };
		}
		await dispatch(createPostAndCodeError(codeError));
		dispatch(closePanel());
	};

	return (
		<Root ref={rootRef}>
			<Dialog maximizable wide noPadding onClose={() => dispatch(closePanel())}>
				<PanelHeader title="Code Error">
					<div style={{ height: "5px" }} />
				</PanelHeader>
				<div style={{ padding: "20px" }}>
					<Content>
						<form className="standard-form review-form" key="form">
							<fieldset className="form-body">
								<div id="controls" className="control-group" key="controls1">
									<div key="headshot" className="headline-flex">
										<div key="padded" style={{ paddingRight: "7px" }}>
											<Headshot person={currentUser} />
										</div>
										<div style={{ marginTop: "-1px" }}>
											<b>{currentUser.username}</b>
											<span className="subhead">
												is starting a conversation about a <a href={url}>code error</a>
											</span>
											{repo && (
												<>
													<span className="subhead">in&nbsp;</span>
													<span className="highlight">{repo}</span>
												</>
											)}
											{branch && (
												<>
													<span className="subhead">on branch&nbsp;</span>
													<span className="highlight">{branch}</span>
												</>
											)}
										</div>
									</div>
									<div key="title" className="control-group has-input-actions">
										<input
											key="title-text"
											type="text"
											name="title"
											className="input-text control"
											tabIndex={0}
											value={title}
											onChange={e => {
												setTitleTouched(true);
												setTitle(e.target.value);
											}}
											placeholder="Title"
										/>
										<div className="actions">
											{title && (
												<Icon
													name="x"
													placement="top"
													title="Clear Title"
													className="clickable"
													onClick={() => setTitle("")}
												/>
											)}
										</div>
									</div>
									{stack && (
										<>
											<div>
												<h4>STACK TRACE</h4>
											</div>
											{parsedStack.map((line, i) => (
												<div onClick={e => onClickStackLine(e, i)}>
													<span>{line}</span>
												</div>
											))}
										</>
									)}
									<div style={{ clear: "both" }} />
								</div>
								<br />
								<MessageInput
									multiCompose
									text={replyText}
									placeholder="Add Comment..."
									onChange={text => {
										setReplyTextTouched(true);
										setReplyText(text);
									}}
								/>
								<div
									key="buttons"
									className="button-group"
									style={{
										marginLeft: "10px",
										marginTop: "10px",
										float: "right",
										width: "auto",
										marginRight: 0
									}}
								>
									<CancelButton toolTip={cancelTip} onClick={confirmCancel} mode="button" />
									<Button
										key="submit"
										style={{
											paddingLeft: "10px",
											paddingRight: "10px",
											// fixed width to handle the isLoading case
											width: "80px",
											marginRight: 0
										}}
										className={cx("control-button", { cancel: !title })}
										type="submit"
										onClick={onSubmit}
									>
										{"Submit"}
									</Button>
								</div>
							</fieldset>
						</form>
					</Content>
				</div>
			</Dialog>
		</Root>
	);
};
