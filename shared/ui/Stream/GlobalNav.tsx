import React from "react";
import { connect, useDispatch, useSelector } from "react-redux";
import { CodeStreamState } from "../store";
import { CSMe } from "../protocols/agent/api.protocol.models";
import { WebviewPanels } from "../ipc/webview.protocol.common";
import Icon from "./Icon";
import Tooltip, { TipTitle, placeArrowTopRight } from "./Tooltip";
import { Link } from "./Link";
import cx from "classnames";
import { getCodeCollisions } from "../store/users/reducer";
import { EMPTY_STATUS } from "./StatusPanel";
import { STEPS } from "./GettingStarted";
import { openPanel } from "./actions";
import { PlusMenu } from "./PlusMenu";
import { EllipsisMenu } from "./EllipsisMenu";
import {
	setCurrentReview,
	setCurrentPullRequest,
	setCreatePullRequest
} from "../store/context/actions";

const sum = (total, num) => total + Math.round(num);

export function GlobalNav() {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const { umis, preferences = {} } = state;
		const currentUser = state.users[state.session.userId!] as CSMe;
		let status =
			currentUser.status && "label" in currentUser.status ? currentUser.status : EMPTY_STATUS;

		return {
			status,
			activePanel: state.context.panelStack[0],
			totalUnread: Object.values(umis.unreads).reduce(sum, 0),
			totalMentions: Object.values(umis.mentions).reduce(sum, 0),
			collisions: getCodeCollisions(state),
			composeCodemarkActive: state.context.composeCodemarkActive,
			currentReviewId: state.context.currentReviewId,
			currentPullRequestId: state.context.currentPullRequestId
		};
	});

	const [ellipsisMenuOpen, setEllipsisMenuOpen] = React.useState();
	const [plusMenuOpen, setPlusMenuOpen] = React.useState();

	const {
		activePanel,
		totalUnread,
		totalMentions,
		collisions,
		currentReviewId,
		currentPullRequestId
	} = derivedState;

	// this would be nice, but unfortunately scm is only loaded on spatial view so we can't
	// rely on it here
	// const { repoId, file } = this.props.currentScm || {};
	const hasFileConflict = false; // this.props.collisions.repoFiles[repoId + ":" + file];

	const umisClass = cx("umis", {
		mentions: totalMentions > 0,
		unread: totalMentions == 0 && totalUnread > 0
	});
	const totalUMICount = totalMentions ? (
		<div className="mentions-badge">{totalMentions > 99 ? "99+" : totalMentions}</div>
	) : totalUnread ? (
		<div className="unread-badge">.</div>
	) : null;

	const toggleEllipsisMenu = event => {
		setEllipsisMenuOpen(ellipsisMenuOpen ? undefined : event.target.closest("label"));
	};

	const togglePlusMenu = event => {
		setPlusMenuOpen(plusMenuOpen ? undefined : event.target.closest("label"));
	};

	const go = panel => {
		dispatch(setCreatePullRequest());
		dispatch(setCurrentPullRequest());
		dispatch(setCurrentReview());
		dispatch(openPanel(panel));
	};

	const selected = panel => activePanel === panel && !currentPullRequestId && !currentReviewId; // && !plusMenuOpen && !menuOpen;
	return React.useMemo(() => {
		return (
			<>
				<nav className="inline" id="global-nav">
					<label
						className={cx({
							selected: selected(WebviewPanels.Status) || selected(WebviewPanels.LandingRedirect)
						})}
						onClick={e => go(WebviewPanels.Status)}
						id="global-nav-status-label"
					>
						<Tooltip
							delay={1}
							trigger={["hover"]}
							title={
								<TipTitle>
									<h1>Your Tasks</h1>
									Assigned issues and code reviews.
									<br />
									This is home base for getting work done.
									<Link
										className="learn-more"
										href="https://docs.codestream.com/userguide/features/tasks"
									>
										learn more
									</Link>
								</TipTitle>
							}
							placement="bottom"
						>
							<span>
								<Icon name="inbox" />
							</span>
						</Tooltip>
					</label>
					<label
						className={cx({ selected: selected(WebviewPanels.CodemarksForFile) })}
						onClick={e => go(WebviewPanels.CodemarksForFile)}
						id="global-nav-file-label"
					>
						<Tooltip
							delay={1}
							trigger={["hover"]}
							title={
								<TipTitle>
									<h1>Comments In Current File</h1>
									We call these <i>Codemarks</i>
									<Link
										className="learn-more"
										href="https://docs.codestream.com/userguide/workflow/discuss-code/"
									>
										learn more
									</Link>
								</TipTitle>
							}
							placement="bottom"
						>
							<span>
								<Icon name="file" />
								{hasFileConflict && <Icon name="alert" className="nav-conflict" />}
							</span>
						</Tooltip>
					</label>
					<label
						className={cx({ selected: selected(WebviewPanels.Activity) })}
						onClick={e => go(WebviewPanels.Activity)}
						id="global-nav-activity-label"
					>
						<Tooltip
							delay={1}
							trigger={["hover"]}
							title={
								<TipTitle>
									<h1>Activity Feed</h1>
									Latest comments, issues,
									<br />
									code reviews and replies.
									<Link
										className="learn-more"
										href="http://docs.codestream.com/userguide/features/activity-feed/"
									>
										learn more
									</Link>
								</TipTitle>
							}
							placement="bottom"
						>
							<span>
								<Icon name="activity" />
								{<span className={umisClass}>{totalUMICount}</span>}
							</span>
						</Tooltip>
					</label>
					<label
						className={cx({ selected: selected(WebviewPanels.FilterSearch) })}
						onClick={() => go(WebviewPanels.FilterSearch)}
						id="global-nav-search-label"
					>
						<Icon
							name="search"
							delay={1}
							trigger={["hover"]}
							title={
								<TipTitle>
									<h1>Filter &amp; Search</h1>
									Search code comments, code reviews,
									<br />
									and codestream content.
									<Link
										className="learn-more"
										href="http://docs.codestream.com/userguide/features/filter-and-search/"
									>
										learn more
									</Link>
								</TipTitle>
							}
							placement="bottomRight"
							onPopupAlign={placeArrowTopRight}
						/>
					</label>
					<label
						className={cx({ selected: selected(WebviewPanels.People) })}
						onClick={e => go(WebviewPanels.People)}
						id="global-nav-team-label"
					>
						<Tooltip
							delay={1}
							trigger={["hover"]}
							title={
								<TipTitle>
									<h1>Your Team</h1>
									View status and local changes
									<br />
									from your teammates.
									<Link
										className="learn-more"
										href="http://docs.codestream.com/userguide/features/team-live-view/"
									>
										learn more
									</Link>
								</TipTitle>
							}
							placement="bottomRight"
							onPopupAlign={placeArrowTopRight}
						>
							<span>
								<Icon name="team" />
								{collisions.nav && <Icon name="alert" className="nav-conflict" />}
							</span>
						</Tooltip>
					</label>
					<label
						onClick={toggleEllipsisMenu}
						className={cx({ active: ellipsisMenuOpen })}
						id="global-nav-more-label"
					>
						<Icon
							name="kebab-horizontal"
							delay={1}
							trigger={["hover"]}
							title="More Actions..."
							placement="bottomRight"
						/>
						{ellipsisMenuOpen && (
							<EllipsisMenu
								closeMenu={() => setEllipsisMenuOpen(undefined)}
								menuTarget={ellipsisMenuOpen}
							/>
						)}
					</label>
				</nav>
				{!derivedState.composeCodemarkActive && (
					<label
						onClick={togglePlusMenu}
						style={{
							position: "fixed",
							display: "flex",
							justifyContent: "center",
							alignItems: "center",
							bottom: "15px",
							right: "15px",
							background: "var(--button-background-color)",
							color: "var(--button-foreground-color)",
							width: "40px",
							height: "40px",
							borderRadius: "20px",
							cursor: "pointer",
							boxShadow: "0 2px 10px rgba(0, 0, 0, 0.5)",
							zIndex: 50
						}}
						className={cx({ active: plusMenuOpen })}
						id="global-nav-plus-label"
					>
						<Icon name="plus" />
						{plusMenuOpen && (
							<PlusMenu closeMenu={() => setPlusMenuOpen(undefined)} menuTarget={plusMenuOpen} />
						)}
					</label>
				)}
			</>
		);
	}, [
		derivedState.status.label,
		activePanel,
		totalUnread,
		totalMentions,
		collisions.nav,
		derivedState.composeCodemarkActive,
		derivedState.currentReviewId,
		derivedState.currentPullRequestId,
		plusMenuOpen,
		ellipsisMenuOpen
	]);
}
