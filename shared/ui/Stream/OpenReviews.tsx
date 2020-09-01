import React, { useMemo } from "react";
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
	GetMyPullRequestsResponse,
	ReposScm,
	ExecuteThirdPartyRequestUntypedType
} from "@codestream/protocols/agent";
import { OpenUrlRequestType } from "@codestream/protocols/webview";
import { Button } from "../src/components/Button";
import { getMyPullRequests } from "../store/providerPullRequests/actions";
import { PRStatusButton, PRBranch } from "./PullRequestComponents";
import { PRHeadshotName } from "../src/components/HeadshotName";
import styled from "styled-components";
import Tag from "./Tag";
import { Provider, IntegrationButtons } from "./IntegrationsPanel";
import { connectProvider } from "./actions";
import { PROVIDER_MAPPINGS } from "./CrossPostIssueControls/types";

export const PullRequestTooltip = (props: { pr: GetMyPullRequestsResponse }) => {
	const { pr } = props;
	const statusIcon =
		pr.isDraft || pr.state === "OPEN" || pr.state === "CLOSED" ? "pull-request" : "git-merge";

	const color = pr.isDraft
		? "gray"
		: pr.state === "OPEN"
		? "green"
		: pr.state === "MERGED"
		? "purple"
		: pr.state === "CLOSED"
		? "red"
		: "blue";

	return (
		<div>
			<div style={{ maxWidth: "400px", padding: "10px" }}>
				{pr.headRepository.nameWithOwner} <Timestamp time={pr.createdAt} relative />
				<div style={{ marginTop: "10px" }}>
					<div style={{ display: "flex" }}>
						<Icon
							name={statusIcon}
							className={`margin-right ${color}-color`}
							style={{ marginTop: "2px" }}
						/>
						<div>
							<span style={{ fontSize: "larger" }}>
								<span className="highlight">{pr.title}</span>{" "}
								<span className="subtle">#{pr.number}</span>
							</span>
							<div className="subtle" style={{ margin: "2px 0 10px 0", fontSize: "larger" }}>
								{pr.bodyText}
							</div>
							<div className="monospace" style={{ fontSize: "smaller" }}>
								<PRBranch>{pr.baseRefName}&nbsp;</PRBranch>
								<span style={{ verticalAlign: "3px" }}>
									<Icon name="arrow-left" />
								</span>
								<PRBranch>&nbsp;{pr.headRefName}</PRBranch>
							</div>
						</div>
					</div>
				</div>
			</div>
			<div
				style={{
					margin: "5px -5px 0 -5px",
					padding: "15px 15px 0 15px",
					borderTop: "1px solid rgba(0, 0, 0, 0.1)"
				}}
			>
				<PRHeadshotName person={pr.author} size={16} />
				opened
			</div>
		</div>
	);
};

const ConnectToCodeHost = styled.div`
	margin: 10px 20px 0 20px;
	button {
		margin: 0 10px 10px 0;
	}
`;

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

		// FIXME hardcoded github
		const isPRSupportedCodeHostConnected = isConnected(state, { name: "github" });
		const hasPRSupportedRepos = repos.filter(r => r.providerGuess === "github").length > 0;

		return {
			teamTagsHash: userSelectors.getTeamTagsHash(state),
			repos,
			reviews,
			currentUserId,
			teamMembers,
			isPRSupportedCodeHostConnected,
			hasPRSupportedRepos,
			// FIXME hardcoded github
			PRSupportedProviders: [state.providers["github*com"]]
		};
	});

	const [prs, setPRs] = React.useState<any[]>([]);
	const [isLoadingPRs, setIsLoadingPRs] = React.useState(false);
	const [query, setQuery] = React.useState("");
	const [queryOpen, setQueryOpen] = React.useState(false);

	const reviewsState = useSelector((state: CodeStreamState) => state.reviews);

	const fetchPRs = async (options?: { force?: boolean }) => {
		setIsLoadingPRs(true);
		// FIXME hardcoded github
		try {
			const response: any = await dispatch(getMyPullRequests("github*com", options, true));
			if (response && response.length) {
				HostApi.instance.track("PR List Rendered", {
					"PR Count": response.length
				});
				setPRs(response);
			}
		} catch (ex) {
			if (ex && ex.indexOf('"message":"Bad credentials"') > -1) {
				// show message about re-authing?
			}
		} finally {
			setIsLoadingPRs(false);
		}
	};

	useDidMount(() => {
		if (!reviewsState.bootstrapped) {
			dispatch(bootstrapReviews());
		}
	});

	useMemo(() => {
		if (derivedState.isPRSupportedCodeHostConnected) {
			fetchPRs();
		}
	}, [derivedState.isPRSupportedCodeHostConnected]);

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

	return useMemo(() => {
		if (
			reviews.length == 0 &&
			!derivedState.isPRSupportedCodeHostConnected &&
			!derivedState.hasPRSupportedRepos
		)
			return null;
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
				)}
				{(derivedState.isPRSupportedCodeHostConnected || derivedState.hasPRSupportedRepos) && (
					<WideStatusSection>
						<div className="filters" style={{ padding: "0 20px 0 20px" }}>
							<Tooltip title="Reload" placement="bottom" delay={1}>
								<RoundedLink onClick={() => fetchPRs({ force: true })}>
									<Icon name="refresh" className={`spinnable ${isLoadingPRs ? "spin" : ""}`} />
									&nbsp;&nbsp;Refresh
								</RoundedLink>
							</Tooltip>
							<H4>
								Pull Requests <sup className="subtle">(beta)</sup>
							</H4>
						</div>
						<Row
							key="load"
							className={queryOpen ? "no-hover" : ""}
							onClick={() => {
								setQueryOpen(true);
								document.getElementById("pr-search-input")!.focus();
							}}
						>
							<div>
								<Icon name="link" />
							</div>
							<div>
								<input
									id="pr-search-input"
									placeholder="Load PR from URL"
									type="text"
									style={{ background: "transparent", width: "100%" }}
									value={query}
									onChange={e => setQuery(e.target.value)}
									onKeyDown={e => {
										if (e.key == "Escape") {
											setQuery("");
										}
										if (e.key == "Enter") {
											goPR(query);
										}
									}}
									onBlur={e => setQueryOpen(false)}
								/>
							</div>
							{(query || queryOpen) && (
								<div className="go-pr">
									<Button className="go-pr" size="compact" onClick={() => goPR(query)}>
										Go
									</Button>
								</div>
							)}
						</Row>

						{/*
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
								*/}
						{derivedState.hasPRSupportedRepos && !derivedState.isPRSupportedCodeHostConnected && (
							<ConnectToCodeHost>
								{derivedState.PRSupportedProviders.map(provider => {
									const providerDisplay = PROVIDER_MAPPINGS[provider.name];
									if (providerDisplay) {
										return (
											<Button onClick={() => dispatch(connectProvider(provider.id, "Status"))}>
												<Icon name={providerDisplay.icon} />
												Connect to {providerDisplay.displayName} to see your PRs
											</Button>
										);
									} else return null;
								})}
							</ConnectToCodeHost>
						)}
						{prs.map(pr => {
							const selected = derivedState.repos.find(repo => {
								return (
									repo.currentBranch === pr.headRefName && repo.name === pr.headRepository.name
								);
							});
							return (
								<Tooltip
									key={"pr-tt-" + pr.id}
									title={<PullRequestTooltip pr={pr} />}
									delay={0.5}
									placement="top"
								>
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
											<span>
												{pr.title} #{pr.number}
											</span>
											{pr.labels && pr.labels.nodes.length > 0 && (
												<span className="cs-tag-container">
													{pr.labels.nodes.map((_, index) => (
														<Tag key={index} tag={{ label: _.name, color: `#${_.color}` }} />
													))}
												</span>
											)}
											<span className="subtle">{pr.bodyText || pr.body}</span>
										</div>
										<div className="icons">
											<span
												onClick={e => {
													e.preventDefault();
													e.stopPropagation();
													HostApi.instance.send(OpenUrlRequestType, {
														url: pr.url
													});
												}}
											>
												<Icon
													name="globe"
													className="clickable"
													title="View on GitHub"
													placement="bottomLeft"
													delay={1}
												/>
											</span>
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
								</Tooltip>
							);
						})}
					</WideStatusSection>
				)}
			</>
		);
	}, [
		reviews,
		prs,
		teamMembers,
		isLoadingPRs,
		query,
		queryOpen,
		props.openRepos,
		derivedState.isPRSupportedCodeHostConnected,
		derivedState.hasPRSupportedRepos
	]);
}
