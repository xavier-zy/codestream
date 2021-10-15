import React, { PropsWithChildren, useEffect } from "react";
import { CardProps, getCardProps, CardFooter } from "@codestream/webview/src/components/Card";
import {
	DidChangeObservabilityDataNotificationType,
	FollowCodeErrorRequestType,
	GetNewRelicAssigneesRequestType,
	ResolveStackTraceResponse
} from "@codestream/protocols/agent";
import {
	MinimumWidthCard,
	Header,
	MetaSection,
	Meta,
	MetaLabel,
	MetaSectionCollapsed,
	HeaderActions,
	BigTitle
} from "../Codemark/BaseCodemark";
import { CSUser, CSCodeError, CSPost } from "@codestream/protocols/api";
import { CodeStreamState } from "@codestream/webview/store";
import { useSelector, useDispatch } from "react-redux";
import Icon from "../Icon";
import Tooltip from "../Tooltip";
import { replaceHtml, emptyArray } from "@codestream/webview/utils";
import { useDidMount } from "@codestream/webview/utilities/hooks";
import { HostApi } from "../..";
import {
	api,
	deleteCodeError,
	fetchCodeError,
	fetchErrorGroup,
	jumpToStackLine,
	upgradePendingCodeError
} from "@codestream/webview/store/codeErrors/actions";
import { setCurrentCodeError } from "@codestream/webview/store/context/actions";
import { DelayedRender } from "@codestream/webview/Container/DelayedRender";
import { getCodeError, getCodeErrorCreator } from "@codestream/webview/store/codeErrors/reducer";
import MessageInput, { AttachmentField } from "../MessageInput";
import styled from "styled-components";
import {
	getTeamMates,
	findMentionedUserIds,
	isCurrentUserInternal,
	getTeamMembers
} from "@codestream/webview/store/users/reducer";
import { createPost, markItemRead } from "../actions";
import { getThreadPosts } from "@codestream/webview/store/posts/reducer";
import { DropdownButton, DropdownButtonItems } from "../DropdownButton";
import { RepliesToPost } from "../Posts/RepliesToPost";
import Menu from "../Menu";
import { confirmPopup } from "../Confirm";
import { Link } from "../Link";
import { Dispatch } from "@codestream/webview/store/common";
import { Loading } from "@codestream/webview/Container/Loading";
import { getPost } from "../../store/posts/reducer";
import { AddReactionIcon, Reactions } from "../Reactions";
import { Attachments } from "../Attachments";
import { RepoMetadata } from "../Review";
import Timestamp from "../Timestamp";
import { Button } from "@codestream/webview/src/components/Button";
import { ButtonRow, Dialog } from "@codestream/webview/src/components/Dialog";
import { Headshot } from "@codestream/webview/src/components/Headshot";
import { SharingModal } from "../SharingModal";
import { PROVIDER_MAPPINGS } from "../CrossPostIssueControls/types";
import { NewRelicErrorGroup } from "@codestream/protocols/agent";
import { isConnected } from "@codestream/webview/store/providers/reducer";
import { Modal } from "../Modal";
import { ConfigureNewRelic } from "../ConfigureNewRelic";
import { ConditionalNewRelic } from "./ConditionalComponent";
import { invite } from "../actions";

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
	errorGroup?: NewRelicErrorGroup;
	parsedStack?: ResolveStackTraceResponse;
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
	errorGroup?: NewRelicErrorGroup;
	post?: CSPost;
	collapsed?: boolean;
	isFollowing?: boolean;
	assignees?: CSUser[];
	setIsEditing: Function;
}

export interface BaseCodeErrorMenuProps {
	codeError: CSCodeError;
	errorGroup?: NewRelicErrorGroup;
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

const ClickLines = styled.div`
	padding: 1px !important;
	&:focus {
		border: none;
		outline: none;
	}
`;

const DisabledClickLine = styled.div`
	color: var(--text-color);
	opacity: 0.4;
	text-align: right;
	direction: rtl;
	text-overflow: ellipsis;
	overflow: hidden;
	padding: 2px 0px 2px 0px;
`;

const ClickLine = styled.div`
	position: relative;
	cursor: pointer;
	padding: 2px 0px 2px 0px;
	text-align: right;
	direction: rtl;
	text-overflow: ellipsis;
	overflow: hidden;
	:hover {
		color: var(--text-color-highlight);
		background: var(--app-background-color-hover);
		opacity: 1;
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
	padding-left: 5px;
`;

export const Message = styled.div`
	width: 100%;
	margin-bottom: 10px;
	display: flex;
	align-items: flex-start;
	font-size: 12px;
`;

const ALERT_SEVERITY_COLORS = {
	"": "#9FA5A5",
	CRITICAL: "#F5554B",
	NOT_ALERTING: "#01B076",
	NOT_CONFIGURED: "#9FA5A5",
	WARNING: "#F0B400",
	// if not connected, we're unknown
	UNKNOWN: "transparent"
};

/**
 * States are from NR
 */
const STATES_TO_ACTION_STRINGS = {
	RESOLVED: "Resolve",
	IGNORED: "Ignore",
	UNRESOLVED: "Unresolve"
};
/**
 * States are from NR
 */
const STATES_TO_DISPLAY_STRINGS = {
	RESOLVED: "Resolved",
	IGNORED: "Ignored",
	UNRESOLVED: "Unresolved",
	// if not connected, we're unknown, just say "Status"
	UNKNOWN: "Status"
};

// if child props are passed in, we assume they are the action buttons/menu for the header
export const BaseCodeErrorHeader = (props: PropsWithChildren<BaseCodeErrorHeaderProps>) => {
	const { codeError, collapsed } = props;
	const dispatch = useDispatch<any>();
	const derivedState = useSelector((state: CodeStreamState) => {
		return {
			isConnectedToNewRelic: isConnected(state, { id: "newrelic*com" }),
			codeErrorCreator: getCodeErrorCreator(state),
			isCurrentUserInternal: isCurrentUserInternal(state),
			ideName: encodeURIComponent(state.ide.name || ""),
			teamMembers: getTeamMembers(state),
			emailAddress: state.session.userId ? state.users[state.session.userId]?.email : ""
		};
	});

	const [items, setItems] = React.useState<DropdownButtonItems[]>([]);
	const [states, setStates] = React.useState<DropdownButtonItems[] | undefined>(undefined);
	const [openConnectionModal, setOpenConnectionModal] = React.useState(false);
	const [isStateChanging, setIsStateChanging] = React.useState(false);
	const [isAssigneeChanging, setIsAssigneeChanging] = React.useState(false);

	const notify = (emailAddress?: string) => {
		// if no email address or it's you
		if (!emailAddress || derivedState.emailAddress.toLowerCase() === emailAddress.toLowerCase()) {
			HostApi.instance.emit(DidChangeObservabilityDataNotificationType.method, {
				type: "Assignment"
			});
		}
	};
	const setAssignee = async (emailAddress: string) => {
		if (!props.errorGroup) return;

		const _setAssignee = async () => {
			setIsAssigneeChanging(true);
			await dispatch(upgradePendingCodeError(props.codeError.id, "Assignee Change"));
			await dispatch(
				api("setAssignee", {
					errorGroupGuid: props.errorGroup?.guid!,
					emailAddress: emailAddress
				})
			);

			notify(emailAddress);
			setTimeout(_ => {
				setIsAssigneeChanging(false);
			}, 1);
		};
		// if it's me, or someone that is already on the team -- just assign them without asking to invite
		if (
			derivedState.emailAddress.toLowerCase() === emailAddress.toLowerCase() ||
			derivedState.teamMembers.find(_ => _.email.toLowerCase() === emailAddress.toLowerCase())
		) {
			_setAssignee();
			return;
		}

		confirmPopup({
			title: "Invite to CodeStream?",
			message: (
				<span>
					Assign the error to <b>{emailAddress}</b> and invite them to join CodeStream
				</span>
			),
			centered: true,
			buttons: [
				{
					label: "Cancel",
					className: "control-button btn-secondary",
					action: () => {
						_setAssignee();
					}
				},
				{
					label: "Invite",
					className: "control-button",
					wait: true,
					action: () => {
						dispatch(
							invite({
								email: emailAddress
							})
						);
						_setAssignee();
					}
				}
			]
		});
	};

	const removeAssignee = async (e: React.SyntheticEvent<Element, Event>, emailAddress, userId) => {
		if (!props.errorGroup) return;

		// dont allow this to bubble to the parent item which would call setAssignee
		e.stopPropagation();
		setIsAssigneeChanging(true);

		await dispatch(upgradePendingCodeError(props.codeError.id, "Assignee Change"));
		await dispatch(
			api("removeAssignee", {
				errorGroupGuid: props.errorGroup?.guid!,
				emailAddress: emailAddress,
				userId: userId
			})
		);

		notify(emailAddress);
		setTimeout(_ => {
			setIsAssigneeChanging(false);
		}, 1);
	};

	const buildStates = () => {
		if (collapsed) return;

		if (derivedState.isConnectedToNewRelic && props.errorGroup?.states) {
			// only show states that aren't the current state
			setStates(
				props.errorGroup?.states
					.filter(_ => (props.errorGroup?.state ? _ !== props.errorGroup.state : true))
					.map(_ => {
						return {
							key: _,
							label: STATES_TO_ACTION_STRINGS[_],
							action: async e => {
								setIsStateChanging(true);
								await dispatch(upgradePendingCodeError(props.codeError.id, "Status Change"));
								await dispatch(
									api("setState", {
										errorGroupGuid: props.errorGroup?.guid!,
										state: _
									})
								);
								notify();
								setIsStateChanging(false);
							}
						};
					}) as DropdownButtonItems[]
			);
		} else {
			setStates([
				{
					key: "UNKNOWN",
					label: STATES_TO_DISPLAY_STRINGS["UNKNOWN"],
					action: e => {
						setOpenConnectionModal(true);
					}
				} as DropdownButtonItems
			]);
		}
	};

	const buildAssignees = async () => {
		if (collapsed) return;

		let assigneeItems: DropdownButtonItems[] = [{ type: "search", label: "", key: "search" }];

		let assigneeEmail;
		if (props.errorGroup && props.errorGroup.assignee) {
			const a = props.errorGroup.assignee;
			const label = a.name || a.email;
			assigneeEmail = a.email;
			assigneeItems.push({ label: "-", key: "sep-assignee" });
			assigneeItems.push({
				label: (
					<span style={{ fontSize: "10px", fontWeight: "bold", opacity: 0.7 }}>
						CURRENT ASSIGNEE
					</span>
				),
				noHover: true,
				disabled: true
			});
			assigneeItems.push({
				icon: <Headshot size={16} display="inline-block" person={{ email: a.email }} />,
				key: a.email,
				label: label,
				subtext: label === a.email ? undefined : a.email,
				floatRight: {
					label: (
						<Icon
							name="x"
							onClick={e => {
								removeAssignee(e, a.email, a.id);
							}}
						/>
					)
				}
			});
		}

		if (derivedState.isConnectedToNewRelic) {
			let { users } = await HostApi.instance.send(GetNewRelicAssigneesRequestType, {});
			if (assigneeEmail) {
				users = users.filter(_ => _.email !== assigneeEmail);
			}

			const usersFromGit = users.filter(_ => _.group === "GIT");
			if (usersFromGit.length) {
				assigneeItems.push({ label: "-", key: "sep-git" });
				assigneeItems.push({
					label: (
						<span style={{ fontSize: "10px", fontWeight: "bold", opacity: 0.7 }}>
							SUGGESTIONS FROM GIT
						</span>
					),
					noHover: true,
					disabled: true
				});
				assigneeItems = assigneeItems.concat(
					usersFromGit.map(_ => {
						const label = _.displayName || _.email;
						return {
							icon: <Headshot size={16} display="inline-block" person={{ email: _.email }} />,
							key: _.id || `git-${_.email}`,
							label: label,
							searchLabel: _.displayName || _.email,
							subtext: label === _.email ? undefined : _.email,
							action: () => setAssignee(_.email)
						};
					})
				);
			}
			const usersFromGitByEmail = usersFromGit.map(_ => _.email);
			// only show users not already shown
			let usersFromCodeStream = derivedState.teamMembers.filter(
				_ => !usersFromGitByEmail.includes(_.email)
			);

			if (assigneeEmail) {
				// if we have an assignee don't re-include them here
				usersFromCodeStream = usersFromCodeStream.filter(_ => _.email !== assigneeEmail);
			}
			if (usersFromCodeStream.length) {
				assigneeItems.push({ label: "-", key: "sep-nr" });
				assigneeItems.push({
					label: (
						<span style={{ fontSize: "10px", fontWeight: "bold", opacity: 0.7 }}>
							OTHER TEAMMATES
						</span>
					),
					noHover: true,
					disabled: true
				});
				assigneeItems = assigneeItems.concat(
					usersFromCodeStream.map(_ => {
						const label = _.fullName || _.email;
						return {
							icon: <Headshot size={16} display="inline-block" person={{ email: _.email }} />,
							key: _.id,
							label: _.fullName || _.email,
							searchLabel: _.fullName || _.username,
							subtext: label === _.email ? undefined : _.email,
							action: () => setAssignee(_.email)
						};
					})
				);
			}
			setItems(assigneeItems);
		} else {
			setItems([{ label: "-", key: "none" }]);
		}
	};

	useEffect(() => {
		buildAssignees();
	}, [props.errorGroup, props.errorGroup?.assignee, derivedState.isConnectedToNewRelic]);

	useEffect(() => {
		buildStates();
	}, [props.errorGroup, props.errorGroup?.state, derivedState.isConnectedToNewRelic]);

	useDidMount(() => {
		if (collapsed) return;

		buildStates();
		buildAssignees();
	});

	return (
		<>
			{openConnectionModal && (
				<Modal
					translucent
					onClose={() => {
						setOpenConnectionModal(false);
					}}
				>
					<Dialog narrow title="">
						<div className="embedded-panel">
							<ConfigureNewRelic
								headerChildren={
									<>
										<div className="panel-header" style={{ background: "none" }}>
											<span className="panel-title">Connect to New Relic</span>
										</div>
										<div style={{ textAlign: "center" }}>
											Working with errors requires a connection to your New Relic account. If you
											don't have one, get a teammate{" "}
											{derivedState.codeErrorCreator
												? `like ${derivedState.codeErrorCreator.fullName ||
														derivedState.codeErrorCreator.username} `
												: ""}
											to invite you.
										</div>
									</>
								}
								disablePostConnectOnboarding={true}
								showSignupUrl={false}
								providerId={"newrelic*com"}
								onClose={e => {
									setOpenConnectionModal(false);
								}}
								onSubmited={async e => {
									setOpenConnectionModal(false);
								}}
							/>
						</div>
					</Dialog>
				</Modal>
			)}
			{!collapsed && (
				<div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
					<div style={{ paddingTop: "4px" }}>
						<div
							style={{
								display: "inline-block",
								width: "10px",
								height: "10px",
								border: derivedState.isConnectedToNewRelic
									? "0px"
									: `1px solid ${ALERT_SEVERITY_COLORS["NOT_CONFIGURED"]}`,
								backgroundColor:
									ALERT_SEVERITY_COLORS[props.errorGroup?.entityAlertingSeverity || "UNKNOWN"],
								margin: "0 5px 0 6px"
							}}
						/>

						<ApmServiceTitle>
							<Tooltip title="Open Entity on New Relic" placement="bottom" delay={1}>
								<span>
									<ConditionalNewRelic
										connected={
											<>
												{props.errorGroup && (
													<>
														<Link href={props.errorGroup.entityUrl}>
															<span className="subtle">{props.errorGroup.entityName}</span>
														</Link>{" "}
														<Icon name="link-external" className="open-external"></Icon>
													</>
												)}
											</>
										}
										disconnected={
											<>
												{!props.errorGroup && props.codeError && props.codeError.objectInfo && (
													<>
														<Link
															href="#"
															onClick={e => {
																e.preventDefault();
																setOpenConnectionModal(true);
															}}
														>
															<span className="subtle">
																{props.codeError.objectInfo.entityName}
															</span>
														</Link>{" "}
														<Icon name="link-external" className="open-external"></Icon>
													</>
												)}
											</>
										}
									/>
								</span>
							</Tooltip>
						</ApmServiceTitle>
					</div>

					<div style={{ marginLeft: "auto", alignItems: "center", whiteSpace: "nowrap" }}>
						{states && (
							<DropdownButton
								items={states}
								selectedKey={props.errorGroup?.state || "UNKNOWN"}
								isLoading={isStateChanging}
								variant="secondary"
								size="compact"
								preventStopPropagation={!derivedState.isConnectedToNewRelic}
								onButtonClicked={
									derivedState.isConnectedToNewRelic
										? undefined
										: e => {
												e.preventDefault();
												e.stopPropagation();

												setOpenConnectionModal(true);
										  }
								}
								wrap
							>
								{STATES_TO_DISPLAY_STRINGS[props.errorGroup?.state || "UNKNOWN"]}
							</DropdownButton>
						)}

						<>
							<div style={{ display: "inline-block", width: "5px" }} />
							<DropdownButton
								items={items}
								preventStopPropagation={!derivedState.isConnectedToNewRelic}
								// onChevronClick={e =>
								// 	!derivedState.isConnectedToNewRelic ? setOpenConnectionModal(true) : undefined
								// }
								variant="secondary"
								size="compact"
								noChevronDown={true}
							>
								<ConditionalNewRelic
									connected={
										<>
											{props.errorGroup && (
												<>
													{isAssigneeChanging ? (
														<>
															<Icon name="sync" className="spin" />
														</>
													) : (
														<>
															{/* no assignee */}
															{(!props.errorGroup.assignee || !props.errorGroup.assignee.email) && (
																<Icon name="person" />
															)}
															{/* has assignee */}
															{props.errorGroup.assignee && props.errorGroup.assignee.email && (
																<Headshot
																	size={20}
																	display="inline-block"
																	person={{ email: props.errorGroup.assignee.email! }}
																/>
															)}
														</>
													)}
												</>
											)}
										</>
									}
									disconnected={
										<Icon
											style={{ cursor: "pointer" }}
											name="person"
											onClick={e => {
												setOpenConnectionModal(true);
											}}
										/>
									}
								/>
							</DropdownButton>
						</>

						<>
							{props.post && <AddReactionIcon post={props.post} className="in-review" />}
							{props.children ||
								(codeError && (
									<>
										<div style={{ display: "inline-block", width: "5px" }} />
										<BaseCodeErrorMenu
											codeError={codeError}
											errorGroup={props.errorGroup}
											collapsed={collapsed}
											setIsEditing={props.setIsEditing}
										/>
									</>
								))}
						</>
					</div>
				</div>
			)}
			<Header>
				<Icon name="alert" className="type" />
				<BigTitle>
					<HeaderActions>
						{props.post && <AddReactionIcon post={props.post} className="in-review" />}
					</HeaderActions>
					<ApmServiceTitle>
						<ConditionalNewRelic
							connected={
								<Tooltip
									title={
										derivedState.isCurrentUserInternal
											? props.codeError?.id
											: props.errorGroup?.errorGroupUrl && props.codeError?.title
											? "Open Error on New Relic"
											: ""
									}
									placement="bottom"
									delay={1}
								>
									{props.errorGroup?.errorGroupUrl && props.codeError.title ? (
										<span>
											<Link
												href={
													props.errorGroup.errorGroupUrl! +
													`&utm_source=codestream&utm_medium=ide-${derivedState.ideName}&utm_campaign=error_group_link`
												}
											>
												{props.codeError.title}
											</Link>{" "}
											<Icon name="link-external" className="open-external"></Icon>
										</span>
									) : (
										<span>{props.codeError.title}</span>
									)}
								</Tooltip>
							}
							disconnected={
								<>
									{props.codeError && !props.errorGroup?.errorGroupUrl && (
										<span>
											<Link
												href="#"
												onClick={e => {
													e.preventDefault();
													setOpenConnectionModal(true);
												}}
											>
												{props.codeError.title}
											</Link>{" "}
											<Icon name="link-external" className="open-external"></Icon>
										</span>
									)}
								</>
							}
						/>
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
			author: props.codeError ? state.users[props.codeError.creatorId] : undefined,
			userIsFollowing: props.codeError
				? (props.codeError.followerIds || []).includes(state.session.userId!)
				: []
		};
	});
	const [isLoading, setIsLoading] = React.useState(false);
	const [menuState, setMenuState] = React.useState<{ open: boolean; target?: any }>({
		open: false,
		target: undefined
	});

	const [shareModalOpen, setShareModalOpen] = React.useReducer(open => !open, false);

	const permalinkRef = React.useRef<HTMLTextAreaElement>(null);

	const menuItems = React.useMemo(() => {
		let items: any[] = [];

		if (props.errorGroup) {
			items.push({
				label: "Refresh",
				icon: <Icon name="refresh" />,
				key: "refresh",
				action: async () => {
					setIsLoading(true);
					await dispatch(fetchErrorGroup(props.codeError));
					setIsLoading(false);
				}
			});
		}

		items = items.concat([
			{
				label: "Share",
				icon: <Icon name="share" />,
				key: "share",
				action: () => setShareModalOpen(true)
			},
			{
				label: "Copy Link",
				icon: <Icon name="copy" />,
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
				icon: <Icon name="eye" />,
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
		]);

		if (codeError?.creatorId === derivedState.currentUser.id) {
			items.push({
				label: "Delete",
				icon: <Icon name="trash" />,
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
	}, [codeError, collapsed, props.errorGroup]);

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
					value={codeError?.permalink}
					style={{ position: "absolute", left: "-9999px" }}
				/>
			</DropdownButton>
		);
	}

	return (
		<>
			<DropdownButton
				items={menuItems}
				selectedKey={props.errorGroup?.state || "UNKNOWN"}
				isLoading={isLoading}
				variant="secondary"
				size="compact"
				noChevronDown
				wrap
			>
				<Icon loading={isLoading} name="kebab-horizontal" />
			</DropdownButton>
			<textarea
				readOnly
				key="permalink-offscreen"
				ref={permalinkRef}
				value={codeError?.permalink}
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
			author: props.codeError ? state.users[props.codeError.creatorId] : undefined,
			codeAuthor: state.users[codeAuthorId || props.codeError?.creatorId],
			codeError,
			errorGroup: props.errorGroup,
			errorGroupIsLoading: (state.codeErrors.errorGroups[codeError.objectId] as any)?.isLoading,
			currentCodeErrorData: state.context.currentCodeErrorData
		};
	});
	const renderedFooter = props.renderFooter && props.renderFooter(CardFooter, ComposeWrapper);
	const { codeError, errorGroup } = derivedState;

	const [currentSelectedLine, setCurrentSelectedLineIndex] = React.useState(
		derivedState.currentCodeErrorData?.lineIndex || 0
	);

	const onClickStackLine = async (event, lineIndex) => {
		event && event.preventDefault();
		if (props.collapsed) return;
		const { stackTraces } = codeError;
		const stackInfo = (stackTraces && stackTraces[0]) || codeError.stackInfo;
		if (stackInfo && stackInfo.lines[lineIndex] && stackInfo.lines[lineIndex].line !== undefined) {
			setCurrentSelectedLineIndex(lineIndex);
			dispatch(
				jumpToStackLine(lineIndex, stackInfo.lines[lineIndex], stackInfo.sha!, stackInfo.repoId!)
			);
		}
	};

	const { stackTraces } = codeError as CSCodeError;
	const stackTrace = stackTraces && stackTraces[0] && stackTraces[0].lines;

	useEffect(() => {
		if (!props.collapsed) {
			const { stackTraces } = codeError;
			const stackInfo = (stackTraces && stackTraces[0]) || codeError.stackInfo;
			if (stackInfo?.lines) {
				let lineIndex = currentSelectedLine;
				const len = stackInfo.lines.length;
				while (
					lineIndex < len &&
					// stackInfo.lines[lineNum].line !== undefined &&
					stackInfo.lines[lineIndex].error
				) {
					lineIndex++;
				}
				if (lineIndex < len) {
					setCurrentSelectedLineIndex(lineIndex);

					try {
						dispatch(
							jumpToStackLine(
								lineIndex,
								stackInfo.lines[lineIndex],
								stackInfo.sha,
								stackInfo.repoId!
							)
						);
					} catch (ex) {
						console.warn(ex);
					}
				}
			}
		}
	}, [codeError]);

	const handleKeyDown = event => {
		if (
			props.stackFrameClickDisabled ||
			props.collapsed ||
			!props.parsedStack?.resolvedStackInfo?.lines
		)
			return;

		const lines = props.parsedStack?.resolvedStackInfo?.lines;
		if (!lines) return;

		let nextLine = currentSelectedLine;
		if (event.key === "ArrowUp" || event.which === 38) {
			event.stopPropagation();
			while (currentSelectedLine >= 0) {
				nextLine--;
				if (!lines[nextLine].error) {
					onClickStackLine(event, nextLine);
					return;
				}
			}
		}
		if (event.key === "ArrowDown" || event.which === 40) {
			event.stopPropagation();
			while (currentSelectedLine <= lines.length) {
				nextLine++;
				if (!lines[nextLine].error) {
					onClickStackLine(event, nextLine);
					return;
				}
			}
		}
	};

	return (
		<MinimumWidthCard {...getCardProps(props)} noCard={!props.collapsed}>
			{props.collapsed && (
				<BaseCodeErrorHeader
					codeError={codeError}
					errorGroup={errorGroup}
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
			{codeError?.text && <Message>{codeError.text}</Message>}

			{/* assuming 3 items (58px) */}
			{!props.collapsed && (
				<div
					style={{
						minHeight: derivedState.errorGroupIsLoading || errorGroup ? "58px" : "initial"
					}}
				>
					{errorGroup &&
						errorGroup.attributes &&
						Object.keys(errorGroup.attributes).map(key => {
							const value: { type: string; value: any } = errorGroup.attributes![key];
							return (
								<DataRow>
									<DataLabel>{key}:</DataLabel>
									<DataValue>
										{value.type === "timestamp" && (
											<Timestamp className="no-padding" time={value.value as number} />
										)}
										{value.type !== "timestamp" && <>{value.value}</>}
									</DataValue>
								</DataRow>
							);
						})}

					{props.repoInfo && (
						<DataRow>
							<DataLabel>Repo:</DataLabel>
							<DataValue>{props.repoInfo.repoName}</DataValue>
						</DataRow>
					)}
					{props.repoInfo?.branch && (
						<DataRow>
							<DataLabel>Build:</DataLabel>
							<DataValue>{props.repoInfo.branch.substr(0, 7)}</DataValue>
						</DataRow>
					)}
				</div>
			)}

			<MetaSection>
				{stackTrace && (
					<Meta>
						<MetaLabel>Stack Trace</MetaLabel>
						<ClickLines id="stack-trace" className="code" tabIndex={0} onKeyDown={handleKeyDown}>
							{(stackTrace || []).map((line, i) => {
								if (!line || !line.fileFullPath) return null;

								const className = i === currentSelectedLine ? "monospace li-active" : "monospace";
								const mline = line.fileFullPath.replace(/\s\s\s\s+/g, "     ");
								return props.stackFrameClickDisabled ||
									props.collapsed ||
									props.parsedStack?.resolvedStackInfo?.lines[i]?.error ? (
									<Tooltip
										title={props.parsedStack?.resolvedStackInfo?.lines[i]?.error}
										placement="bottom"
										delay={1}
									>
										<DisabledClickLine key={"disabled-line" + i} className="monospace">
											<span>
												<span style={{ opacity: ".6" }}>{line.method}</span>({mline}:
												<strong>{line.line}</strong>
												{line.column ? `:${line.column}` : null})
											</span>
										</DisabledClickLine>
									</Tooltip>
								) : (
									<ClickLine
										key={"click-line" + i}
										className={className}
										onClick={e => onClickStackLine(e, i)}
									>
										<span>
											<span style={{ opacity: ".6" }}>{line.method}</span>({mline}:
											<strong>{line.line}</strong>
											{line.column ? `:${line.column}` : null})
										</span>
									</ClickLine>
								);
							})}
						</ClickLines>
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

const ReplyInput = (props: { codeError: CSCodeError }) => {
	const dispatch = useDispatch();
	const [text, setText] = React.useState("");
	const [attachments, setAttachments] = React.useState<AttachmentField[]>([]);
	const [isLoading, setIsLoading] = React.useState(false);
	const teamMates = useSelector((state: CodeStreamState) => getTeamMates(state));

	const submit = async () => {
		// don't create empty replies
		if (text.length === 0) return;

		setIsLoading(true);

		const actualCodeError = ((await dispatch(
			upgradePendingCodeError(props.codeError.id, "Comment")
		)) as any) as {
			codeError: CSCodeError;
		};
		dispatch(markItemRead(props.codeError.id, actualCodeError.codeError.numReplies + 1));

		await dispatch(
			createPost(
				actualCodeError.codeError.streamId,
				actualCodeError.codeError.postId,
				replaceHtml(text)!,
				null,
				findMentionedUserIds(teamMates, text),
				{
					entryPoint: "Code Error",
					files: attachments
				}
			)
		);

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
						Comment
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
	errorGroup?: NewRelicErrorGroup;
	parsedStack?: ResolveStackTraceResponse;
}

function isPropsWithId(props: PropsWithId | PropsWithCodeError): props is PropsWithId {
	return (props as any).id != undefined;
}

export type CodeErrorProps = PropsWithId | PropsWithCodeError;

const CodeErrorForCodeError = (props: PropsWithCodeError) => {
	const { codeError, ...baseProps } = props;
	let disposableDidChangeDataNotification: { dispose(): void };
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
	});

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

		requestAnimationFrame(() => {
			const $stackTrace = document.getElementById("stack-trace");
			if ($stackTrace) $stackTrace.focus();
		});

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
					{props.codeError.postId && (
						<>
							{derivedState.replies?.length > 0 && <MetaLabel>Activity</MetaLabel>}
							<RepliesToPost
								streamId={props.codeError.streamId}
								parentPostId={props.codeError.postId}
								itemId={props.codeError.id}
								numReplies={props.codeError.numReplies}
							/>
						</>
					)}

					{InputContainer && (
						<InputContainer>
							<ReplyInput codeError={codeError} />
						</InputContainer>
					)}
				</Footer>
			);
		});

	const repoInfo = React.useMemo(() => {
		const { stackTraces } = codeError;
		let stackInfo = stackTraces && stackTraces[0]; // TODO deal with multiple stacks
		if (!stackInfo) stackInfo = (codeError as any).stackInfo; // this is for old code, maybe can remove after a while?
		if (stackInfo && stackInfo.repoId) {
			const repo = derivedState.repos[stackInfo.repoId];
			if (!repo) return undefined;

			return { repoName: repo.name, branch: stackInfo.sha! };
		} else {
			return undefined;
		}
	}, [codeError, derivedState.repos]);

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
				parsedStack={props.parsedStack}
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
