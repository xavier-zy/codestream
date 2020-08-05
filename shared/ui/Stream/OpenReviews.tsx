import React from "react";
import { useDispatch, useSelector } from "react-redux";
import * as reviewSelectors from "../store/reviews/reducer";
import * as userSelectors from "../store/users/reducer";
import { CodeStreamState } from "../store";
import { Row } from "./CrossPostIssueControls/IssueDropdown";
import Icon from "./Icon";
import { Headshot, PRHeadshot } from "../src/components/Headshot";
import { H4, WideStatusSection, RoundedLink } from "./StatusPanel";
import { setCurrentReview, setCurrentPullRequest } from "../store/context/actions";
import { useDidMount } from "../utilities/hooks";
import { bootstrapReviews } from "../store/reviews/actions";
import Tooltip from "./Tooltip";
import Timestamp from "./Timestamp";
import { isConnected } from "../store/providers/reducer";
import { RequestType } from "vscode-languageserver-protocol";
import { HostApi } from "../webview-api";
import {
	ExecuteThirdPartyTypedRequest,
	GetMyPullRequestsResponse,
	GetMyPullRequestsRequest
} from "@codestream/protocols/agent";

export function OpenReviews() {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const { session, context, providers } = state;

		const currentUserId = session.userId!;
		const teamMembers = userSelectors.getTeamMembers(state);
		const reviews = reviewSelectors.getByStatusAndUser(state, "open", currentUserId);
		const isGitHubConnected = isConnected(state, { name: "github" });

		return {
			reviews,
			currentUserId,
			teamMembers,
			isGitHubConnected
		};
	});

	const [prs, setPRs] = React.useState<any[]>([]);
	const [isLoadingPRs, setIsLoadingPRs] = React.useState(false);

	const reviewsState = useSelector((state: CodeStreamState) => state.reviews);

	const fetchPRs = async () => {
		setIsLoadingPRs(true);
		const request = new RequestType<
			ExecuteThirdPartyTypedRequest<GetMyPullRequestsRequest>,
			GetMyPullRequestsResponse[],
			any,
			any
		>("codestream/provider/generic");
		const response = await HostApi.instance.send(request, {
			method: "getMyPullRequests",
			providerId: "github*com"
		});
		// console.warn("GOT PRS: ", response);
		setIsLoadingPRs(false);
		setPRs(response);
	};

	useDidMount(() => {
		if (!reviewsState.bootstrapped) {
			dispatch(bootstrapReviews());
		}

		if (derivedState.isGitHubConnected) {
			fetchPRs();
		}
	});

	const { reviews, teamMembers } = derivedState;

	const sortedReviews = [...reviews];
	sortedReviews.sort((a, b) => b.createdAt - a.createdAt);

	return React.useMemo(() => {
		if (reviews.length == 0 && prs.length == 0) return null;
		return (
			<>
				{reviews.length > 0 && (
					<WideStatusSection>
						<H4 style={{ paddingLeft: "20px" }}>Open Reviews</H4>
						{sortedReviews.map(review => {
							const creator = teamMembers.find(user => user.id === review.creatorId);
							return (
								<Row
									key={"review-" + review.id}
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
				)}
				{prs.length > 0 && (
					<WideStatusSection>
						<div style={{ padding: "0 20px 0 20px" }}>
							<Tooltip title="Reload" placement="bottom" delay={1}>
								<RoundedLink onClick={() => fetchPRs()}>
									<Icon name="refresh" className={`spinnable ${isLoadingPRs ? "spin" : ""}`} />
									&nbsp;&nbsp;Refresh
								</RoundedLink>
							</Tooltip>
							<H4>Pull Requests</H4>
						</div>
						{prs.map(pr => {
							return (
								<Row key={"pr-" + pr.id} onClick={() => dispatch(setCurrentPullRequest(pr.id))}>
									<div>
										<PRHeadshot person={pr.author} />
									</div>
									<div>
										<span>{pr.title}</span>
										<span className="subtle">{pr.bodyText}</span>
									</div>
									<div className="icons">
										<Icon
											name="globe"
											className="clickable"
											title="View on GitHub"
											placement="bottomLeft"
											delay={1}
										/>
										<Icon
											name="review"
											className="clickable"
											title="Review Changes"
											placement="bottomLeft"
											delay={1}
										/>
										<Timestamp time={pr.createdAt} relative abbreviated />
									</div>
								</Row>
							);
						})}
					</WideStatusSection>
				)}
			</>
		);
	}, [reviews, prs, teamMembers, isLoadingPRs]);
}
