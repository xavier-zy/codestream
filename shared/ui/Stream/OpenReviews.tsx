import React from "react";
import { useDispatch, useSelector } from "react-redux";
import * as reviewSelectors from "../store/reviews/reducer";
import * as userSelectors from "../store/users/reducer";
import { CodeStreamState } from "../store";
import { Row } from "./CrossPostIssueControls/IssueDropdown";
import Icon from "./Icon";
import { Headshot, PRHeadshot } from "../src/components/Headshot";
import { H4, WideStatusSection, RoundedLink, RoundedSearchLink } from "./StatusPanel";
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
	GetMyPullRequestsRequest,
	ReposScm,
	ExecuteThirdPartyRequestUntypedType
} from "@codestream/protocols/agent";
import { OpenUrlRequestType } from "@codestream/protocols/webview";

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
		const isGitHubConnected = isConnected(state, { name: "github" });
		const repos = props.openRepos.map(repo => {
			const id = repo.id || "";
			return { ...repo, name: state.repos[id] ? state.repos[id].name : "" };
		});

		return {
			repos,
			reviews,
			currentUserId,
			teamMembers,
			isGitHubConnected
		};
	});

	const [prs, setPRs] = React.useState<any[]>([]);
	const [isLoadingPRs, setIsLoadingPRs] = React.useState(false);
	const [query, setQuery] = React.useState("");
	const [queryOpen, setQueryOpen] = React.useState(false);

	const reviewsState = useSelector((state: CodeStreamState) => state.reviews);

	const fetchPRs = async (options?: { force?: boolean }) => {
		setIsLoadingPRs(true);
		const request = new RequestType<
			ExecuteThirdPartyTypedRequest<GetMyPullRequestsRequest>,
			GetMyPullRequestsResponse[],
			any,
			any
		>("codestream/provider/generic");
		const response = await HostApi.instance.send(request, {
			method: "getMyPullRequests",
			providerId: "github*com",
			params: {
				force: options && options.force,
				isOpen: true
			}
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

	const goPR = async (url: string) => {
		HostApi.instance
			.send(ExecuteThirdPartyRequestUntypedType, {
				method: "getPullRequestIdFromUrl",
				providerId: "github*com",
				params: { url }
			})
			.then((id: any) => {
				if (id) {
					dispatch(setCurrentReview(""));
					dispatch(setCurrentPullRequest(id));
				} else {
					HostApi.instance.send(OpenUrlRequestType, {
						url
					});
				}
			})
			.catch(e => {
				HostApi.instance.send(OpenUrlRequestType, {
					url
				});
			});
	};

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
								<RoundedLink onClick={() => fetchPRs({ force: true })}>
									<Icon name="refresh" className={`spinnable ${isLoadingPRs ? "spin" : ""}`} />
									&nbsp;&nbsp;Refresh
								</RoundedLink>
							</Tooltip>
							<RoundedSearchLink className={queryOpen ? "" : "collapsed"}>
								<Icon
									name="hash"
									onClick={() => {
										setQueryOpen(true);
										document.getElementById("pr-search-input")!.focus();
									}}
								/>
								<span className="accordion">
									<Icon
										name="x"
										onClick={() => {
											setQuery("");
											setQueryOpen(false);
										}}
									/>
									<input
										autoFocus
										id="pr-search-input"
										placeholder="Enter PR URL"
										type="text"
										value={query}
										onChange={e => setQuery(e.target.value)}
										onKeyDown={e => {
											if (e.key == "Escape") {
												setQuery("");
												setQueryOpen(false);
											}
											if (e.key == "Enter") {
												goPR(query);
											}
										}}
									/>
								</span>
							</RoundedSearchLink>
							<H4>
								Pull Requests <sup className="subtle">(beta)</sup>
							</H4>
						</div>
						{prs.map(pr => {
							console.warn("IN A PR: ", derivedState.repos);
							const selected = derivedState.repos.find(repo => {
								console.warn("COMPARING: ", repo, " TO ", pr);
								return (
									repo.currentBranch === pr.headRefName && repo.name === pr.headRepository.name
								);
							});
							return (
								<Row
									key={"pr-" + pr.id}
									className={selected ? "selected" : ""}
									onClick={() => dispatch(setCurrentPullRequest(pr.id))}
								>
									<div>
										{selected && <Icon name="arrow-right" className="selected-icon" />}
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
	}, [reviews, prs, teamMembers, isLoadingPRs, query, queryOpen, props.openRepos]);
}
