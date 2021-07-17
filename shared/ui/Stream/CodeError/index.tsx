import React, { PropsWithChildren } from "react";
import cx from "classnames";
import {
	CardBody,
	CardProps,
	getCardProps,
	CardFooter
} from "@codestream/webview/src/components/Card";
import { FollowCodeErrorRequestType } from "@codestream/protocols/agent";
import {
	MinimumWidthCard,
	Header,
	MetaSection,
	Meta,
	MetaLabel,
	MetaSectionCollapsed,
	HeaderActions,
	KebabIcon,
	BigTitle
} from "../Codemark/BaseCodemark";
import { CSUser, CSCodeError, CodemarkType, CSPost } from "@codestream/protocols/api";
import { CodeStreamState } from "@codestream/webview/store";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import Icon from "../Icon";
import Tooltip from "../Tooltip";
import { replaceHtml, emptyArray } from "@codestream/webview/utils";
import { useDidMount } from "@codestream/webview/utilities/hooks";
import { HostApi } from "../..";
import {
	deleteCodeError,
	fetchCodeError,
	jumpToStackLine
} from "@codestream/webview/store/codeErrors/actions";
import { setCurrentCodeError } from "@codestream/webview/store/context/actions";
import { DelayedRender } from "@codestream/webview/Container/DelayedRender";
import { getCodeError } from "@codestream/webview/store/codeErrors/reducer";
import MessageInput, { AttachmentField } from "../MessageInput";
import styled from "styled-components";
import Button from "../Button";
import { getTeamMates, findMentionedUserIds } from "@codestream/webview/store/users/reducer";
import { createPost, markItemRead } from "../actions";
import { getThreadPosts } from "@codestream/webview/store/posts/reducer";
import { DropdownButton } from "../DropdownButton";
import { RepliesToPost } from "../Posts/RepliesToPost";
import Menu from "../Menu";
import { confirmPopup } from "../Confirm";
import { createCodemark } from "@codestream/webview/store/codemarks/actions";
import { Link } from "../Link";
import { MarkdownText } from "../MarkdownText";
import { CodeErrorForm } from "../CodeErrorForm";
import { Dispatch } from "@codestream/webview/store/common";
import { Loading } from "@codestream/webview/Container/Loading";
import { getPost } from "../../store/posts/reducer";
import { AddReactionIcon, Reactions } from "../Reactions";
import { Attachments } from "../Attachments";

interface SimpleError {
	/**
	 * Error message from the server
	 */
	message: string;
	/**
	 * Typed error message (to switch off of, etc.)
	 */
	type?: string;
}

export interface BaseCodeErrorProps extends CardProps {
	codeError: CSCodeError;
	post?: CSPost;
	headerError?: SimpleError;
	currentUserId?: string;
	collapsed?: boolean;
	isFollowing?: boolean;
	assignees?: CSUser[];
	renderFooter?: (
		footer: typeof CardFooter,
		inputContainer?: typeof ComposeWrapper
	) => React.ReactNode;
	setIsEditing: Function;
	onRequiresCheckPreconditions?: Function;
}

export interface BaseCodeErrorHeaderProps {
	codeError: CSCodeError;
	post?: CSPost;
	collapsed?: boolean;
	isFollowing?: boolean;
	assignees?: CSUser[];
	setIsEditing: Function;
}

export interface BaseCodeErrorMenuProps {
	codeError: CSCodeError;
	setIsEditing: Function;
	collapsed?: boolean;
}

const Clickable = styled(Link)`
	display: inline-block;
	padding-top: 2px;
`;

const ComposeWrapper = styled.div.attrs(() => ({
	className: "compose codemark-compose"
}))`
	&&& {
		padding: 0 !important;
	}
	.message-input#input-div {
		max-width: none !important;
	}
`;

export const ExpandedAuthor = styled.div`
	width: 100%;
	color: var(--text-color-subtle);
	white-space: normal;
`;

export const Description = styled.div`
	margin-bottom: 15px;
`;

export const MetaCheckboxWithHoverIcon = styled.div`
	display: flex;
	.icon {
		margin: 3px 0 0 8px;
		display: none !important;
	}
	&:hover .icon {
		display: inline-block !important;
	}
`;

export const MetaIcons = styled.span`
	margin-left: 5px;
	display: inline-block;
	height: 14px;
	.icon {
		margin-left: 5px;
	}
`;

// if child props are passed in, we assume they are the action buttons/menu for the header
export const BaseCodeErrorHeader = (props: PropsWithChildren<BaseCodeErrorHeaderProps>) => {
	const { codeError, collapsed } = props;

	return (
		<Header>
			<Icon name="alert" className="type" />
			<BigTitle>
				<HeaderActions>
					{props.post && <AddReactionIcon post={props.post} className="in-review" />}
					{props.children || (
						<BaseCodeErrorMenu
							codeError={codeError}
							collapsed={collapsed}
							setIsEditing={props.setIsEditing}
						/>
					)}
				</HeaderActions>
				<MarkdownText text={codeError.title} />
			</BigTitle>
		</Header>
	);
};

export const BaseCodeErrorMenu = (props: BaseCodeErrorMenuProps) => {
	const { codeError, collapsed } = props;

	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const post =
			codeError && codeError.postId
				? getPost(state.posts, codeError!.streamId, codeError.postId)
				: undefined;

		return {
			post,
			currentUserId: state.session.userId!,
			currentUser: state.users[state.session.userId!],
			author: state.users[props.codeError.creatorId],
			userIsFollowing: (props.codeError.followerIds || []).includes(state.session.userId!)
		};
	}, shallowEqual);
	const [menuState, setMenuState] = React.useState<{ open: boolean; target?: any }>({
		open: false,
		target: undefined
	});

	const permalinkRef = React.useRef<HTMLTextAreaElement>(null);

	const menuItems = React.useMemo(() => {
		const items: any[] = [
			{
				label: "Copy link",
				key: "copy-permalink",
				action: () => {
					if (permalinkRef && permalinkRef.current) {
						permalinkRef.current.select();
						document.execCommand("copy");
					}
				}
			},
			{
				label: derivedState.userIsFollowing ? "Unfollow" : "Follow",
				key: "toggle-follow",
				action: () => {
					const value = !derivedState.userIsFollowing;
					const changeType = value ? "Followed" : "Unfollowed";
					HostApi.instance.send(FollowCodeErrorRequestType, {
						id: codeError.id,
						value
					});
					HostApi.instance.track("Notification Change", {
						Change: `Code Error ${changeType}`,
						"Source of Change": "Code Error menu"
					});
				}
			}
		];

		if (codeError.creatorId === derivedState.currentUser.id) {
			items.push(
				{
					label: "Edit",
					key: "edit",
					action: () => props.setIsEditing(true)
				},
				{
					label: "Delete",
					action: () => {
						confirmPopup({
							title: "Are you sure?",
							message: "Deleting a code error cannot be undone.",
							centered: true,
							buttons: [
								{ label: "Go Back", className: "control-button" },
								{
									label: "Delete Code Error",
									className: "delete",
									wait: true,
									action: () => {
										dispatch(deleteCodeError(codeError.id));
										dispatch(setCurrentCodeError());
									}
								}
							]
						});
					}
				}
			);
		}

		return items;
	}, [codeError, collapsed]);

	if (collapsed) {
		return (
			<DropdownButton size="compact" items={menuItems}>
				<textarea
					readOnly
					key="permalink-offscreen"
					ref={permalinkRef}
					value={codeError.permalink}
					style={{ position: "absolute", left: "-9999px" }}
				/>
			</DropdownButton>
		);
	}

	return (
		<>
			<KebabIcon
				className="kebab"
				onClickCapture={e => {
					e.preventDefault();
					e.stopPropagation();
					if (menuState.open) {
						setMenuState({ open: false });
					} else {
						setMenuState({
							open: true,
							target: e.currentTarget.closest("button")
						});
					}
				}}
			>
				<Icon name="kebab-horizontal" />
			</KebabIcon>
			<textarea
				readOnly
				key="permalink-offscreen"
				ref={permalinkRef}
				value={codeError.permalink}
				style={{ position: "absolute", left: "-9999px" }}
			/>
			{menuState.open && (
				<Menu
					target={menuState.target}
					action={() => setMenuState({ open: false })}
					items={menuItems}
					align="dropdownRight"
				/>
			)}
		</>
	);
};

const BaseCodeError = (props: BaseCodeErrorProps) => {
	const { codeError } = props;

	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const codeAuthorId = (props.codeError.codeAuthorIds || [])[0];
		return {
			providers: state.providers,
			isInVscode: state.ide.name === "VSC",
			author: state.users[props.codeError.creatorId],
			codeAuthor: state.users[codeAuthorId || props.codeError.creatorId]
		};
	}, shallowEqual);
	const renderedFooter = props.renderFooter && props.renderFooter(CardFooter, ComposeWrapper);

	const onClickStackLine = async (event, lineNum) => {
		event && event.preventDefault();
		if (props.collapsed) return;
		const { stackInfo } = props.codeError;
		if (
			stackInfo &&
			stackInfo.lines &&
			stackInfo.lines[lineNum] &&
			!stackInfo.lines[lineNum].error
		) {
			await dispatch(jumpToStackLine(stackInfo.lines[lineNum], stackInfo.sha!));
		}
	};

	const stackTraceLines = props.codeError.stackTrace.split("\n");

	useDidMount(() => {
		if (!props.collapsed) {
			const { stackInfo } = props.codeError;
			if (stackInfo && stackInfo.lines && stackInfo.lines[1] && !stackInfo.lines[1].error) {
				dispatch(jumpToStackLine(stackInfo.lines[1], stackInfo.sha!));
			}
		}
	});

	return (
		<MinimumWidthCard {...getCardProps(props)} noCard={!props.collapsed}>
			<CardBody>
				{props.collapsed && (
					<BaseCodeErrorHeader
						codeError={codeError}
						post={props.post}
						collapsed={props.collapsed}
						setIsEditing={props.setIsEditing}
					/>
				)}
				{props.headerError && props.headerError.message && (
					<div
						className="color-warning"
						style={{
							display: "flex",
							padding: "10px 0",
							whiteSpace: "normal",
							alignItems: "flex-start"
						}}
					>
						<Icon name="alert" />
						<div style={{ paddingLeft: "10px" }}>{props.headerError.message}</div>
					</div>
				)}

				<MetaSection>
					{!props.collapsed && (
						<Meta>
							<MarkdownText text={props.codeError.title} />
						</Meta>
					)}
					{!props.collapsed && props.codeError.providerUrl && (
						<Link href={props.codeError.providerUrl}>Open in New Relic</Link>
					)}
					{props.codeError.stackTrace && (
						<Meta>
							<MetaLabel>Stack Trace</MetaLabel>
							{stackTraceLines.map((line, i) => (
								<div onClick={e => onClickStackLine(e, i)}>
									<span>{line}</span>
								</div>
							))}
						</Meta>
					)}
					{props.post && (
						<div style={{ marginBottom: "10px" }}>
							<Reactions className="reactions no-pad-left" post={props.post} />
						</div>
					)}
					{!props.collapsed && props.post && <Attachments post={props.post as CSPost} />}
				</MetaSection>
				{props.collapsed && renderMetaSectionCollapsed(props)}
			</CardBody>
			{renderedFooter}
		</MinimumWidthCard>
	);
};

const renderMetaSectionCollapsed = (props: BaseCodeErrorProps) => {
	if (!props.isFollowing) return null;
	return (
		<>
			<MetaSectionCollapsed>
				{props.isFollowing && (
					<span>
						<Icon
							className="detail-icon"
							title="You are following this code error"
							placement="bottomLeft"
							align={{ offset: [-18, 4] }}
							name="eye"
						/>
					</span>
				)}
				{props.codeError.numReplies > 0 && (
					<Tooltip title="Show replies" placement="bottom">
						<span className="detail-icon">
							<Icon name="comment" /> {props.codeError.numReplies}
						</span>
					</Tooltip>
				)}
			</MetaSectionCollapsed>
		</>
	);
};

const ReplyInput = (props: {
	codeErrorId: string;
	parentPostId: string;
	streamId: string;
	numReplies: number;
}) => {
	const dispatch = useDispatch();
	const [text, setText] = React.useState("");
	const [attachments, setAttachments] = React.useState<AttachmentField[]>([]);
	const [isChangeRequest, setIsChangeRequest] = React.useState(false);
	const [isLoading, setIsLoading] = React.useState(false);
	const teamMates = useSelector((state: CodeStreamState) => getTeamMates(state));

	const submit = async () => {
		// don't create empty replies
		if (text.length === 0) return;

		setIsLoading(true);
		dispatch(markItemRead(props.codeErrorId, props.numReplies + 1));
		if (isChangeRequest) {
			await dispatch(
				createCodemark({
					text: replaceHtml(text)!,
					parentPostId: props.parentPostId,
					type: CodemarkType.Comment,
					codeBlocks: [],
					assignees: [],
					relatedCodemarkIds: [],
					accessMemberIds: [],
					isChangeRequest: true,
					tags: [],
					isPseudoCodemark: true,
					files: attachments
				})
			);
		} else {
			await dispatch(
				createPost(
					props.streamId,
					props.parentPostId,
					replaceHtml(text)!,
					null,
					findMentionedUserIds(teamMates, text),
					{
						entryPoint: "Code Error",
						files: attachments
					}
				)
			);
			setIsChangeRequest(false);
		}
		setIsLoading(false);
		setText("");
		setAttachments([]);
	};

	return (
		<>
			<MessageInput
				multiCompose
				text={text}
				placeholder="Add Comment..."
				onChange={setText}
				onSubmit={submit}
				attachments={attachments}
				attachmentContainerType="reply"
				setAttachments={setAttachments}
			/>
			<div style={{ display: "flex", flexWrap: "wrap" }}>
				<div style={{ textAlign: "right", flexGrow: 1 }}>
					<Tooltip
						title={
							<span>
								Submit Comment
								<span className="keybinding extra-pad">
									{navigator.appVersion.includes("Macintosh") ? "⌘" : "Ctrl"} ENTER
								</span>
							</span>
						}
						placement="bottomRight"
						delay={1}
					>
						<Button
							style={{
								// fixed width to handle the isLoading case
								width: "100px",
								margin: "10px 0",
								float: "right"
							}}
							className={cx("control-button", { cancel: text.length === 0 })}
							type="submit"
							disabled={text.length === 0}
							onClick={submit}
							loading={isLoading}
						>
							{isChangeRequest ? "Request Change" : "Add Comment"}
						</Button>
					</Tooltip>
				</div>
			</div>
		</>
	);
};

type FromBaseCodeErrorProps = Pick<
	BaseCodeErrorProps,
	"collapsed" | "hoverEffect" | "onClick" | "className" | "renderFooter"
>;

interface PropsWithId extends FromBaseCodeErrorProps {
	id: string;
}

interface PropsWithCodeError extends FromBaseCodeErrorProps {
	codeError: CSCodeError;
}

function isPropsWithId(props: PropsWithId | PropsWithCodeError): props is PropsWithId {
	return (props as any).id != undefined;
}

export type CodeErrorProps = PropsWithId | PropsWithCodeError;

const CodeErrorForCodeError = (props: PropsWithCodeError) => {
	const { codeError, ...baseProps } = props;
	let disposableDidChangeDataNotification: { dispose(): void };
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const post =
			codeError && codeError.postId
				? getPost(state.posts, codeError!.streamId, codeError.postId)
				: undefined;

		return {
			post,
			currentTeamId: state.context.currentTeamId,
			currentUser: state.users[state.session.userId!],
			author: state.users[props.codeError.creatorId],
			repos: state.repos,
			userIsFollowing: (props.codeError.followerIds || []).includes(state.session.userId!),
			replies: props.collapsed
				? emptyArray
				: getThreadPosts(state, codeError.streamId, codeError.postId)
		};
	}, shallowEqual);

	const [preconditionError, setPreconditionError] = React.useState<SimpleError>({
		message: "",
		type: ""
	});
	const [isEditing, setIsEditing] = React.useState(false);

	const webviewFocused = useSelector((state: CodeStreamState) => state.context.hasFocus);
	useDidMount(() => {
		if (!props.collapsed && webviewFocused) {
			HostApi.instance.track("Page Viewed", { "Page Name": "Code Error Details" });
		}
		return () => {
			// cleanup this disposable on unmount. it may or may not have been set.
			disposableDidChangeDataNotification && disposableDidChangeDataNotification.dispose();
		};
	});

	const renderFooter =
		props.renderFooter ||
		((Footer, InputContainer) => {
			if (props.collapsed) return null;

			return (
				<Footer className="replies-to-review" style={{ borderTop: "none", marginTop: 0 }}>
					{derivedState.replies.length > 0 && <MetaLabel>Activity</MetaLabel>}
					<RepliesToPost
						streamId={props.codeError.streamId}
						parentPostId={props.codeError.postId}
						itemId={props.codeError.id}
						numReplies={props.codeError.numReplies}
					/>
					{InputContainer && (
						<InputContainer>
							<ReplyInput
								codeErrorId={codeError.id}
								parentPostId={codeError.postId}
								streamId={codeError.streamId}
								numReplies={codeError.numReplies}
							/>
						</InputContainer>
					)}
				</Footer>
			);
		});

	if (isEditing) {
		return <CodeErrorForm editingCodeError={props.codeError} />;
	} else {
		return (
			<BaseCodeError
				{...baseProps}
				codeError={props.codeError}
				post={derivedState.post}
				isFollowing={derivedState.userIsFollowing}
				currentUserId={derivedState.currentUser.id}
				renderFooter={renderFooter}
				setIsEditing={setIsEditing}
				headerError={preconditionError}
			/>
		);
	}
};

const CodeErrorForId = (props: PropsWithId) => {
	const { id, ...otherProps } = props;

	const dispatch = useDispatch<Dispatch>();
	const codeError = useSelector((state: CodeStreamState) => {
		return getCodeError(state.codeErrors, id);
	});
	const [notFound, setNotFound] = React.useState(false);

	useDidMount(() => {
		let isValid = true;

		if (codeError == null) {
			dispatch(fetchCodeError(id))
				.then(result => {
					if (!isValid) return;
					if (result == null) setNotFound(true);
				})
				.catch(() => setNotFound(true));
		}

		return () => {
			isValid = false;
		};
	});

	if (notFound)
		return (
			<MinimumWidthCard>
				This code error was not found. Perhaps it was deleted by the author, or you don't have
				permission to view it.
			</MinimumWidthCard>
		);

	if (codeError == null)
		return (
			<DelayedRender>
				<Loading />
			</DelayedRender>
		);

	return <CodeErrorForCodeError codeError={codeError} {...otherProps} />;
};

export const CodeError = (props: CodeErrorProps) => {
	if (isPropsWithId(props)) return <CodeErrorForId {...props} />;
	return <CodeErrorForCodeError {...props} />;
};
