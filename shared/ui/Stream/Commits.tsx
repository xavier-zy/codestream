import { DEFAULT_FR_QUERIES } from "@codestream/webview/store/preferences/reducer";
import { setUserPreference } from "@codestream/webview/Stream/actions";
import React from "react";
import { shallowEqual, useDispatch, useSelector } from "react-redux";
import * as reviewSelectors from "../store/reviews/reducer";
import * as userSelectors from "../store/users/reducer";
import { CodeStreamState } from "../store";
import { Row } from "./CrossPostIssueControls/IssueDropdown";
import Icon from "./Icon";
import { Headshot } from "../src/components/Headshot";
import {
	setCurrentReview,
	setNewPostEntry,
	openPanel,
	openModal,
	setCreatePullRequest
} from "../store/context/actions";
import { useDidMount } from "../utilities/hooks";
import { bootstrapReviews } from "../store/reviews/actions";
import Tooltip from "./Tooltip";
import Timestamp from "./Timestamp";
import { ReposScm } from "@codestream/protocols/agent";
import Tag from "./Tag";
import {
	PaneHeader,
	PaneBody,
	NoContent,
	PaneState,
	PaneNode,
	PaneNodeName
} from "../src/components/Pane";
import { WebviewModals, WebviewPanels } from "../ipc/webview.protocol.common";
import { Link } from "./Link";

interface Props {
	openRepos: ReposScm[];
	paneState: PaneState;
}

export const Commits = React.memo(function Commits(props: Props) {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const { session, preferences } = state;

		const queries = preferences.fetchRequestQueries || DEFAULT_FR_QUERIES;

		const currentUserId = session.userId!;
		const teamMembers = userSelectors.getTeamMembers(state);
		const feedbackRequests = queries.map(_ => {
			const reviews = reviewSelectors.getByStatusAndUser(state, _.query, currentUserId);
			return _.limit ? reviews.slice(0, _.limit) : reviews;
		});

		return {
			team: state.teams[state.context.currentTeamId],
			teamTagsHash: userSelectors.getTeamTagsHash(state),
			queries,
			feedbackRequests,
			currentUserId,
			teamMembers
		};
	}, shallowEqual);

	const bootstrapped = useSelector((state: CodeStreamState) => state.reviews.bootstrapped);

	const setQueries = queries => {
		dispatch(setUserPreference(["fetchRequestQueries"], [...queries]));
	};

	useDidMount(() => {
		if (!bootstrapped) {
			dispatch(bootstrapReviews());
		}
	});

	const { team, teamMembers, currentUserId, feedbackRequests, queries } = derivedState;
	const { adminIds } = team;

	const sortedFeedbackRequests = React.useMemo(() => {
		return feedbackRequests.map(frRequests => {
			const sorted = [...frRequests];
			sorted.sort((a, b) => b.createdAt - a.createdAt);
			return sorted;
		});
	}, [feedbackRequests]);

	const totalFRs = React.useMemo(() => {
		let total = 0;
		feedbackRequests.map(_ => {
			total += _.length;
		});
		return total;
	}, [feedbackRequests]);

	const toggleQueryHidden = (e, index) => {
		if (e.target.closest(".actions")) return;
		const newQueries = [...queries];
		newQueries[index].hidden = !newQueries[index].hidden;
		setQueries(newQueries);
	};

	// console.warn("Rendering reviews...");
	return (
		<>
			<PaneHeader title="Commits" id={WebviewPanels.Commits} isLoading={!bootstrapped}></PaneHeader>
			{props.paneState !== PaneState.Collapsed && (
				<PaneBody>
					{!bootstrapped && (
						<Row>
							<Icon name="sync" className="spin margin-right" />
							<span>Loading...</span>
						</Row>
					)}
					{bootstrapped && totalFRs === 0 && <NoContent>No commits found.</NoContent>}
					{totalFRs > 0 && (
						<>
							{sortedFeedbackRequests.map((frRequests, index) => {
								const query = queries[index];
								const count = frRequests ? frRequests.length : 0;
								return (
									<PaneNode key={index}>
										<PaneNodeName
											onClick={e => toggleQueryHidden(e, index)}
											title={query.name}
											collapsed={query.hidden}
											count={count}
											isLoading={false}
										/>
										{!query.hidden &&
											frRequests &&
											frRequests.map((review, index) => {
												const creator = teamMembers.find(user => user.id === review.creatorId);
												return (
													<Row
														key={"review-" + review.id}
														className="pane-row"
														onClick={() => dispatch(setCurrentReview(review.id))}
													>
														<div>
															<Tooltip title={creator && creator.fullName} placement="bottomLeft">
																<span>
																	<Headshot person={creator} />
																</span>
															</Tooltip>
														</div>
														<div>
															<span>{review.title}</span>
															{review.tags && review.tags.length > 0 && (
																<span className="cs-tag-container">
																	{(review.tags || []).map(tagId => {
																		const tag = derivedState.teamTagsHash[tagId];
																		return tag ? <Tag key={tagId} tag={tag} /> : null;
																	})}
																</span>
															)}
															<span className="subtle">{review.text}</span>
														</div>
														<div className="icons">
															{query.query === "approved" && (
																<Icon
																	name="pull-request"
																	title="Create a PR"
																	placement="bottomLeft"
																	delay={1}
																	onClick={async e => {
																		e.stopPropagation();
																		await dispatch(setCreatePullRequest(review.id));
																		dispatch(openPanel(WebviewPanels.NewPullRequest));
																	}}
																/>
															)}
															<Icon
																name="review"
																className="clickable"
																title="Review Changes"
																placement="bottomLeft"
																delay={1}
															/>
															<Timestamp time={review.createdAt} relative abbreviated />
														</div>
													</Row>
												);
											})}
									</PaneNode>
								);
							})}
						</>
					)}
				</PaneBody>
			)}
		</>
	);
});
