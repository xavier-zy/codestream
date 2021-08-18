import React, { PropsWithChildren, useEffect } from "react";
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
import { HeadshotName } from "@codestream/webview/src/components/HeadshotName";
import { RepoInfo, RepoMetadata } from "../Review";
import Timestamp from "../Timestamp";
import { Button } from "@codestream/webview/src/components/Button";
import { ButtonRow } from "@codestream/webview/src/components/Dialog";
import { Headshot } from "@codestream/webview/src/components/Headshot";
import { InlineMenu } from "@codestream/webview/src/components/controls/InlineMenu";
import { SharingModal } from "../SharingModal";
import { PROVIDER_MAPPINGS } from "../CrossPostIssueControls/types";

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
	repoInfo?: RepoMetadata;
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
	stackFrameClickDisabled?: boolean;
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

const DisabledClickLine = styled.div`
	color: var(--text-color);
	opacity: 0.7;
`;

const ClickLine = styled.div`
	position: relative;
	cursor: pointer;
	color: var(--text-color);
	:hover {
		color: var(--text-color-highlight);
		opacity: 1;
	}
	opacity: 0.7;
	&.selected {
		color: var(--text-color-highlight);
		opacity: 1;
	}
	.icon {
		position: absolute !important;
		left: -21px;
	}
`;

const DataRow = styled.div`
	display: flex;
	align-items: center;
`;
const DataLabel = styled.div`
	margin-right: 5px;
`;
const DataValue = styled.div`
	color: var(--text-color-subtle);
`;

const ApmServiceTitle = styled.span`
	a {
		color: var(--text-color-highlight);
		text-decoration: none;
	}
	.open-external {
		margin-left: 5px;
		font-size: 12px;
		visibility: hidden;
		color: var(--text-color-highlight);
	}
	&:hover .open-external {
		visibility: visible;
	}
`;

// if child props are passed in, we assume they are the action buttons/menu for the header
export const BaseCodeErrorHeader = (props: PropsWithChildren<BaseCodeErrorHeaderProps>) => {
	const { codeError, collapsed } = props;

	const [resolveMethod, setResolveMethod] = React.useState("resolve");
	const resolveCodeError = (status: string) => {};

	const [assignee, setAssignee] = React.useState("pez@codestream.com");

	return (
		<>
			<div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
				<div>
					{/* TODO get actual service status + color */}
					<div
						style={{
							display: "inline-block",
							width: "10px",
							height: "10px",
							backgroundColor: "gray",
							margin: "0 5px 0 6px"
						}}
					/>
					<ApmServiceTitle>
						<Tooltip title="Open on New Relic" placement="bottom" delay={1}>
							<span>
								{/* TODO get actual service name and link */}
								<Link href="#">
									<span className="subtle">CodeStream-Demo API Server</span>
								</Link>{" "}
								<Icon name="link-external" className="open-external"></Icon>
							</span>
						</Tooltip>
					</ApmServiceTitle>
				</div>

				<div style={{ marginLeft: "auto", alignItems: "center", whiteSpace: "nowrap" }}>
					<DropdownButton
						items={[
							{
								key: "resolve",
								label: `Resolve`,
								onSelect: () => setResolveMethod("RESOLVE"),
								action: () => resolveCodeError("resolve")
							},
							{ label: "-" },
							{
								key: "ignore",
								label: `Ignore`,
								onSelect: () => setResolveMethod("IGNORE"),
								action: () => resolveCodeError("ignore")
							}
						]}
						selectedKey={"resolve"}
						variant="secondary"
						size="compact"
						wrap
					>
						Unresolved
					</DropdownButton>
					<div style={{ display: "inline-block", width: "10px" }} />
					<InlineMenu
						items={[
							{ type: "search", label: "", placeholder: "User name" },
							{ label: "-" },
							{
								label: (
									<span style={{ fontSize: "10px", fontWeight: "bold", opacity: 0.7 }}>
										CURRENT ASSIGNEE
									</span>
								),
								noHover: true,
								disabled: true
							},
							{
								icon: (
									<Headshot
										size={16}
										display="inline-block"
										person={{ email: "pez@codestream.com" }}
									/>
								),
								key: "pez",
								label: `Peter Pezaris`,
								searchLabel: "Peter Pezaris",
								subtext: "ppezaris@newrelic.com",
								floatRight: { label: <Icon name="x" /> },
								action: () => setAssignee("pez@codestream.com")
							},
							{ label: "-" },
							{
								label: (
									<span style={{ fontSize: "10px", fontWeight: "bold", opacity: 0.7 }}>
										SUGGESTIONS FROM GIT
									</span>
								),
								noHover: true,
								disabled: true
							},
							{
								key: "colin",
								label: `Colin Stryker`,
								searchLabel: "Colin Stryker",
								subtextNoPadding: "cstryker@newrelic.com",
								action: () => setAssignee("cstryker@newrelic.com")
							},
							{
								key: "dave",
								label: `David Hersh`,
								searchLabel: "David Hersh",
								subtextNoPadding: "dhersh@newrelic.com",
								action: () => setAssignee("dhersh@newrelic.com")
							},
							{ label: "-" },
							{
								label: (
									<span style={{ fontSize: "10px", fontWeight: "bold", opacity: 0.7 }}>
										OTHER TEAMMATES
									</span>
								),
								noHover: true,
								disabled: true
							},
							{
								key: "brian",
								label: `Brian Canzanella`,
								searchLabel: "Brian Canzanella",
								subtextNoPadding: "bcanzanella@newrelic.com",
								action: () => setAssignee("bcanzanella@newrelic.com")
							}
						]}
					>
						<Headshot size={20} display="inline-block" person={{ email: assignee }} />
					</InlineMenu>
					<>
						{props.post && <AddReactionIcon post={props.post} className="in-review" />}
						{/* props.children || (
							<BaseCodeErrorMenu
								codeError={codeError}
								collapsed={collapsed}
								setIsEditing={props.setIsEditing}
							/>
						) */}
					</>
				</div>
			</div>
			<Header>
				<Icon name="alert" className="type" />
				<BigTitle>
					<HeaderActions>
						{props.post && <AddReactionIcon post={props.post} className="in-review" />}
					</HeaderActions>
					<ApmServiceTitle>
						<Tooltip title="Open Error on New Relic" placement="bottom" delay={1}>
							<span>
								{/* TODO get the actual class of error here */}
								{/* {codeError.title} */}
								<Link href="#">Error: hash table index out of range</Link>{" "}
								<Icon name="link-external" className="open-external"></Icon>
							</span>
						</Tooltip>
					</ApmServiceTitle>
				</BigTitle>
			</Header>
		</>
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

	const [shareModalOpen, setShareModalOpen] = React.useReducer(open => !open, false);

	const permalinkRef = React.useRef<HTMLTextAreaElement>(null);

	const menuItems = React.useMemo(() => {
		const items: any[] = [
			{
				label: "Share",
				key: "share",
				action: () => setShareModalOpen(true)
			},
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
			items.push({
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
			});
		}

		return items;
	}, [codeError, collapsed]);

	if (shareModalOpen)
		return (
			<SharingModal
				codeError={props.codeError!}
				post={derivedState.post}
				onClose={() => setShareModalOpen(false)}
			/>
		);

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
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const codeError = state.codeErrors[props.codeError.id] || props.codeError;
		const codeAuthorId = (props.codeError.codeAuthorIds || [])[0];
		return {
			providers: state.providers,
			isInVscode: state.ide.name === "VSC",
			author: state.users[props.codeError.creatorId],
			codeAuthor: state.users[codeAuthorId || props.codeError.creatorId],
			codeError
		};
	}, shallowEqual);
	const renderedFooter = props.renderFooter && props.renderFooter(CardFooter, ComposeWrapper);
	const { codeError } = derivedState;

	const [currentSelectedLine, setCurrentSelectedLine] = React.useState(0);

	const onClickStackLine = async (event, lineNum) => {
		event && event.preventDefault();
		if (props.collapsed) return;
		const { stackInfo } = codeError;
		if (stackInfo && stackInfo.lines[lineNum] && stackInfo.lines[lineNum].line !== undefined) {
			setCurrentSelectedLine(lineNum);
			dispatch(jumpToStackLine(stackInfo.lines[lineNum], stackInfo.sha!, stackInfo.repoId!));
		}
	};

	const stackTraceLines = codeError.stackTrace.split("\n");

	useEffect(() => {
		if (!props.collapsed) {
			const { stackInfo } = codeError;
			if (stackInfo) {
				// FIXME this should be zero
				let lineNum = 1;
				const len = stackInfo.lines.length;
				while (
					lineNum < len &&
					// stackInfo.lines[lineNum].line !== undefined &&
					stackInfo.lines[lineNum].error
				) {
					lineNum++;
				}
				if (lineNum < len) {
					setCurrentSelectedLine(lineNum);
					dispatch(jumpToStackLine(stackInfo.lines[lineNum], stackInfo.sha, stackInfo.repoId!));
				}
			}
		}
	}, [codeError]);

	return (
		<MinimumWidthCard {...getCardProps(props)} noCard={!props.collapsed}>
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

			{!props.collapsed && (
				<>
					<DataRow>
						<DataLabel>Timestamp:</DataLabel>
						<DataValue>
							<Timestamp className="no-padding" time={props.codeError.createdAt} />
						</DataValue>
					</DataRow>
					<DataRow>
						<DataLabel>URL host:</DataLabel>
						<DataValue>localhost.codestream.us:12079</DataValue>
					</DataRow>
					<DataRow>
						<DataLabel>URL path:</DataLabel>
						<DataValue>/posts</DataValue>
					</DataRow>
					{props.repoInfo && (
						<DataRow>
							<DataLabel>Repo:</DataLabel>
							<DataValue>{props.repoInfo.repoName}</DataValue>
						</DataRow>
					)}
					{props.repoInfo && (
						<DataRow>
							<DataLabel>Build:</DataLabel>
							<DataValue>{props.repoInfo.branch.substr(0, 8)}</DataValue>
						</DataRow>
					)}
				</>
			)}

			<MetaSection>
				{codeError.stackTrace && (
					<Meta>
						<MetaLabel>Stack Trace</MetaLabel>
						{stackTraceLines.map((line, i) => {
							if (i === 0) return null;
							if (line.includes("processTicksAndRejections")) return;
							const selected = i === currentSelectedLine;
							const className = selected ? "monospace selected" : "monospace";
							const mline = line
								.replace(/.*codestream-server\//, "")
								.replace(/\)/, "")
								.replace(/\s\s\s\s+/g, "     ");
							return props.stackFrameClickDisabled ? (
								<DisabledClickLine className="monospace">
									<span>{mline}</span>
								</DisabledClickLine>
							) : (
								<ClickLine className={className} onClick={e => onClickStackLine(e, i)}>
									{selected && <Icon name="arrow-right" />}
									<span>{mline}</span>
								</ClickLine>
							);
						})}
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
			{!props.collapsed &&
				props &&
				props.post &&
				props.post.sharedTo &&
				props.post.sharedTo.length > 0 && (
					<div className="related">
						<div className="related-label">Shared To</div>
						{props.post.sharedTo.map(target => {
							const providerDisplay = PROVIDER_MAPPINGS[target.providerId];
							return (
								<Link className="external-link" href={target.url}>
									{providerDisplay && providerDisplay.icon && (
										<span>
											<Icon name={providerDisplay.icon} />
										</span>
									)}
									{target.channelName}
								</Link>
							);
						})}
					</div>
				)}
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
	codeError: CSCodeError;
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
		dispatch(markItemRead(props.codeError.id, props.numReplies + 1));
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
				placeholder="Add a comment..."
				onChange={setText}
				onSubmit={submit}
				attachments={attachments}
				attachmentContainerType="reply"
				setAttachments={setAttachments}
			/>
			<ButtonRow style={{ marginTop: 0 }}>
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
					<Button disabled={text.length === 0} onClick={submit} isLoading={isLoading}>
						Submit
					</Button>
				</Tooltip>
			</ButtonRow>
		</>
	);
};

type FromBaseCodeErrorProps = Pick<
	BaseCodeErrorProps,
	"collapsed" | "hoverEffect" | "onClick" | "className" | "renderFooter" | "stackFrameClickDisabled"
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
	const [shareModalOpen, setShareModalOpen] = React.useReducer(open => !open, false);

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
								codeError={codeError}
								parentPostId={codeError.postId}
								streamId={codeError.streamId}
								numReplies={codeError.numReplies}
							/>
						</InputContainer>
					)}
				</Footer>
			);
		});

	const repoInfo = React.useMemo(() => {
		const { stackInfo } = codeError;
		if (stackInfo && stackInfo.repoId) {
			const repo = derivedState.repos[stackInfo.repoId];
			return { repoName: repo.name, branch: stackInfo.sha! };
		} else {
			return undefined;
		}
	}, [codeError, derivedState.repos]);

	if (isEditing) {
		return <CodeErrorForm editingCodeError={props.codeError} />;
	} else {
		return (
			<>
				{shareModalOpen && (
					<SharingModal
						codeError={props.codeError}
						post={derivedState.post}
						onClose={() => setShareModalOpen(false)}
					/>
				)}
				<BaseCodeError
					{...baseProps}
					codeError={props.codeError}
					post={derivedState.post}
					repoInfo={repoInfo}
					isFollowing={derivedState.userIsFollowing}
					currentUserId={derivedState.currentUser.id}
					renderFooter={renderFooter}
					setIsEditing={setIsEditing}
					headerError={preconditionError}
				/>
			</>
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
