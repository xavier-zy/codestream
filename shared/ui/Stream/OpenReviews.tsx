import React from "react";
import { useDispatch, useSelector } from "react-redux";
import * as reviewSelectors from "../store/reviews/reducer";
import * as userSelectors from "../store/users/reducer";
import * as providerSelectors from "../store/providers/reducer";
import { CodeStreamState } from "../store";
import { Row } from "./CrossPostIssueControls/IssueDropdown";
import Icon from "./Icon";
import { Headshot } from "../src/components/Headshot";
import { H4, WideStatusSection } from "./StatusPanel";
import { setCurrentReview } from "../store/context/actions";
import { useDidMount } from "../utilities/hooks";
import { bootstrapReviews } from "../store/reviews/actions";
import Tooltip from "./Tooltip";
import Timestamp from "./Timestamp";
import { ReposScm } from "@codestream/protocols/agent";
import Tag from "./Tag";
import { isConnected } from "../store/providers/reducer";

interface Props {
	openRepos: ReposScm[];
}

export function OpenReviews(props: Props) {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const { session } = state;

		const currentUserId = session.userId!;
		const teamMembers = userSelectors.getTeamMembers(state);
		const reviews = reviewSelectors.getByStatusAndUser(state, "open", currentUserId);
		const repos = props.openRepos.map(repo => {
			const id = repo.id || "";
			return { ...repo, name: state.repos[id] ? state.repos[id].name : "" };
		});
		const prSupportedProviders = providerSelectors.getSupportedPullRequestHosts(state);
		const prConnectedProviders = prSupportedProviders.filter(_ => isConnected(state, { id: _.id }));

		// FIXME make this more solid
		const hasPRSupportedRepos = repos.filter(r => r.providerGuess === "github").length > 0;

		return {
			teamTagsHash: userSelectors.getTeamTagsHash(state),
			reviews,
			currentUserId,
			teamMembers,
			isPRSupportedCodeHostConnected: prConnectedProviders.length > 0,
			hasPRSupportedRepos,
			PRSupportedProviders: prSupportedProviders,
			PRConnectedProviders: prConnectedProviders
		};
	});

	const reviewsState = useSelector((state: CodeStreamState) => state.reviews);

	// const fetchPRs = async (options?: { force?: boolean }) => {
	// 	setIsLoadingPRs(true);
	// 	try {
	// 		let _responses = [];
	// 		for (const connectedProvider of derivedState.PRConnectedProviders) {
	// 			try {
	// 				const queryStrings = queries.map(_ => _.query);
	// 				const response: any = await dispatch(
	// 					getMyPullRequests(connectedProvider.id, queryStrings, options, true)
	// 				);
	// 				if (response && response.length) {
	// 					let count = 0;
	// 					response.forEach(group => (count += group.length));
	// 					HostApi.instance.track("PR List Rendered", {
	// 						"PR Count": count
	// 					});
	// 					setPullRequestGroups(response);
	// 				}
	// 			} catch (ex) {
	// 				console.error(ex);
	// 			}
	// 		}
	// 		if (_responses.length) {
	// 			HostApi.instance.track("PR List Rendered", {
	// 				"PR Count": _responses.length
	// 			});
	// 			setPRs(_responses);
	// 		}
	// 	} catch (ex) {
	// 		if (ex && ex.indexOf('"message":"Bad credentials"') > -1) {
	// 			// show message about re-authing?
	// 		}
	// 	} finally {
	// 		setIsLoadingPRs(false);
	// 	}
	// };

	// const fetchTestPRs = async query => {
	// 	setIsLoadingTestPRs(true);
	// 	// FIXME hardcoded github
	// 	try {
	// 		const response: any = await dispatch(
	// 			getMyPullRequests("github*com", [query], { force: true }, true)
	// 		);
	// 		if (response && response.length) {
	// 			HostApi.instance.track("PR Test List Rendered", {
	// 				"PR Count": response.length
	// 			});
	// 			setTestPRSummaries(response[0]);
	// 		}
	// 	} catch (ex) {
	// 		if (ex && ex.indexOf('"message":"Bad credentials"') > -1) {
	// 			// show message about re-authing?
	// 		}
	// 	} finally {
	// 		setIsLoadingTestPRs(false);
	// 	}
	// };

	useDidMount(() => {
		if (!reviewsState.bootstrapped) {
			dispatch(bootstrapReviews());
		}
	});

	const { reviews, teamMembers } = derivedState;

	const sortedReviews = [...reviews];
	sortedReviews.sort((a, b) => b.createdAt - a.createdAt);

	if (reviews.length == 0) return null;
	return (
		<WideStatusSection>
			<H4 style={{ paddingLeft: "20px" }}>Open Reviews</H4>
			{sortedReviews.map(review => {
				const creator = teamMembers.find(user => user.id === review.creatorId);
				return (
					<Row key={"review-" + review.id} onClick={() => dispatch(setCurrentReview(review.id))}>
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
										return tag ? <Tag tag={tag} /> : null;
									})}
								</span>
							)}
							<span className="subtle">{review.text}</span>
						</div>
						<div className="icons">
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
		</WideStatusSection>
	);
}
