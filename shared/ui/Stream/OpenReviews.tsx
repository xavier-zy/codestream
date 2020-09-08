import React, { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import * as reviewSelectors from "../store/reviews/reducer";
import * as userSelectors from "../store/users/reducer";
import * as providerSelectors from "../store/providers/reducer";
import { CodeStreamState } from "../store";
import { Row } from "./CrossPostIssueControls/IssueDropdown";
import Icon from "./Icon";
import { Headshot, PRHeadshot } from "../src/components/Headshot";
import { H4, WideStatusSection, RoundedLink, RoundedSearchLink, ButtonRow } from "./StatusPanel";
import { setCurrentReview, setCurrentPullRequest } from "../store/context/actions";
import { useDidMount } from "../utilities/hooks";
import { bootstrapReviews } from "../store/reviews/actions";
import Tooltip from "./Tooltip";
import Timestamp from "./Timestamp";
import { isConnected } from "../store/providers/reducer";
import { HostApi } from "../webview-api";
import {
	ReposScm,
	QueryThirdPartyRequestType,
	ThirdPartyProviderConfig,
	GetMyPullRequestsResponse,
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
import { connectProvider, openPanel } from "./actions";
import { PROVIDER_MAPPINGS } from "./CrossPostIssueControls/types";
import { configureAndConnectProvider } from "../store/providers/actions";
import { Modal } from "./Modal";
import { Dialog } from "../src/components/Dialog";
import { confirmPopup } from "./Confirm";
import { Link } from "./Link";
import { Checkbox } from "../src/components/Checkbox";

const PRSummaryName = styled.div`
	padding: 2px 20px;
	display: flex;
	cursor: pointer;
	> .icon {
		display: inline-block;
		width: 16px;
		text-align: center;
	}
	&:hover {
		background: var(--app-background-color-hover);
		color: var(--text-color-highlight);
	}
`;
const PRSummaryGroup = styled.div`
	${Row} {
		padding-left: 40px;
		.selected-icon {
			left: 20px;
		}
	}
	.actions {
		margin-left: auto;
		display: none;
		.icon {
			margin-left: 5px;
			opacity: 0.7;
		}
	}
	&:hover .actions {
		display: block;
	}
`;

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
								{pr.bodyText.substr(0, 300)}
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
		const prSupportedProviders = providerSelectors.getSupportedPullRequestHosts(state);
		const prConnectedProviders = prSupportedProviders.filter(_ => isConnected(state, { id: _.id }));

		// FIXME make this more solid
		const hasPRSupportedRepos = repos.filter(r => r.providerGuess === "github").length > 0;

		return {
			teamTagsHash: userSelectors.getTeamTagsHash(state),
			repos,
			reviews,
			currentUserId,
			teamMembers,
			isPRSupportedCodeHostConnected: prConnectedProviders.length > 0,
			hasPRSupportedRepos,
			PRSupportedProviders: prSupportedProviders,
			PRConnectedProviders: prConnectedProviders
		};
	});

	const [prs, setPRs] = React.useState<any[]>([]);
	const [pullRequestGroups, setPullRequestGroups] = React.useState<any[]>([]);
	const [isLoadingPRs, setIsLoadingPRs] = React.useState(false);
	const [query, setQuery] = React.useState("");
	const [queryOpen, setQueryOpen] = React.useState(false);
	const [configureQuery, setConfigureQuery] = React.useState<number | undefined>(undefined);
	const [queries, setQueries] = React.useState([
		// { name: "Local PR Branches", query: `is:pr author:@me`, active: true, repoOnly: true },
		{
			name: "Waiting on my Review",
			query: `is:pr review-requested:@me`,
			active: true,
			repoOnly: true
		},
		{ name: "Assigned to Me", query: `is:pr assignee:@me`, active: true, repoOnly: true },
		{ name: "Created by Me", query: `is:pr author:@me`, active: true, repoOnly: true }
	]);
	const [configureQueryNameField, setConfigureQueryNameField] = React.useState("");
	const [configureQueryQueryField, setConfigureQueryQueryField] = React.useState("");
	const [configureQueryRepoOnlyField, setConfigureQueryRepoOnlyField] = React.useState(true);
	const [testPRSummaries, setTestPRSummaries] = React.useState<GetMyPullRequestsResponse[]>([]);
	const [isLoadingTestPRs, setIsLoadingTestPRs] = React.useState(false);

	const reviewsState = useSelector((state: CodeStreamState) => state.reviews);

	const fetchPRs = async (options?: { force?: boolean }) => {
		setIsLoadingPRs(true);
		try {
			let _responses = [];
			for (const connectedProvider of derivedState.PRConnectedProviders) {
				try {
					const queryStrings = queries.map(_ => _.query);
					const response: any = await dispatch(
						getMyPullRequests(connectedProvider.id, queryStrings, options, true)
					);
					if (response && response.length) {
						let count = 0;
						response.forEach(group => (count += group.length));
						HostApi.instance.track("PR List Rendered", {
							"PR Count": count
						});
						setPullRequestGroups(response);
					}
				} catch (ex) {
					console.error(ex);
				}
			}
			if (_responses.length) {
				HostApi.instance.track("PR List Rendered", {
					"PR Count": _responses.length
				});
				setPRs(_responses);
			}
		} catch (ex) {
			if (ex && ex.indexOf('"message":"Bad credentials"') > -1) {
				// show message about re-authing?
			}
		} finally {
			setIsLoadingPRs(false);
		}
	};

	const fetchTestPRs = async query => {
		setIsLoadingTestPRs(true);
		// FIXME hardcoded github
		try {
			const response: any = await dispatch(
				getMyPullRequests("github*com", [query], { force: true }, true)
			);
			if (response && response.length) {
				HostApi.instance.track("PR Test List Rendered", {
					"PR Count": response.length
				});
				setTestPRSummaries(response[0]);
			}
		} catch (ex) {
			if (ex && ex.indexOf('"message":"Bad credentials"') > -1) {
				// show message about re-authing?
			}
		} finally {
			setIsLoadingTestPRs(false);
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

	const addQuery = () => editQuery(queries.length);
	const editQuery = index => {
		setConfigureQuery(index);
		const query = queries[index];
		if (query) {
			setConfigureQueryNameField(query.name);
			setConfigureQueryQueryField(query.query);
			setConfigureQueryRepoOnlyField(query.repoOnly);
		} else {
			setConfigureQueryNameField("");
			setConfigureQueryQueryField("");
			setConfigureQueryRepoOnlyField(true);
		}
	};
	const deleteQuery = index => {
		confirmPopup({
			title: "Are you sure?",
			message: "Do you want to delete this query?",
			centered: true,
			buttons: [
				{ label: "Go Back", className: "control-button" },
				{
					label: "Delete Query",
					className: "delete",
					action: async () => {
						setQueries(queries.filter((q, i) => i !== index));
						setPullRequestGroups(pullRequestGroups.filter((q, i) => i !== index));
					}
				}
			]
		});
	};
	const toggleQueryActive = index => {
		setQueries(queries.map((q, i) => ({ ...q, active: i == index ? !q.active : q.active })));
	};

	const saveQuery = () => {
		const query = {
			name: configureQueryNameField,
			query: configureQueryQueryField,
			repoOnly: configureQueryRepoOnlyField,
			active: true
		};
		if (configureQuery !== undefined) {
			// it's an edit
			const newQueries = [...queries];
			newQueries[configureQuery] = query;
			setQueries(newQueries);
		} else {
			// it's new
			setQueries([...queries, query]);
		}
		// fetchPRs({ force: true });
		setConfigureQuery(undefined);
	};

	const goPR = async (url: string) => {
		HostApi.instance
			.send(QueryThirdPartyRequestType, {
				url: url
			})
			.then((providerInfo: any) => {
				if (providerInfo && providerInfo.providerId) {
					HostApi.instance
						.send(ExecuteThirdPartyRequestUntypedType, {
							method: "getPullRequestIdFromUrl",
							providerId: providerInfo.providerId,
							params: { url }
						})
						.then(id => {
							if (id) {
								dispatch(setCurrentReview(""));
								dispatch(setCurrentPullRequest(providerInfo.providerId, id as string));
							} else {
								HostApi.instance.send(OpenUrlRequestType, {
									url
								});
							}
						});
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

	const editingQuery =
		configureQuery !== undefined
			? queries[configureQuery] || { name: "", query: "", repoOnly: true, active: true }
			: undefined;

	if (
		reviews.length == 0 &&
		!derivedState.isPRSupportedCodeHostConnected &&
		!derivedState.hasPRSupportedRepos
	)
		return null;
	return (
		<>
			{editingQuery && (
				<Modal translucent>
					<Dialog title="Pull Request Query" onClose={() => setConfigureQuery(undefined)}>
						<form className="standard-form">
							<fieldset className="form-body">
								The variable @me can be used to specify the logged in user within a search.{" "}
								<Link href="https://docs.github.com/en/github/searching-for-information-on-github/searching-issues-and-pull-requests">
									Search syntax
								</Link>
								.
								<div id="controls">
									<div style={{ margin: "20px 0" }}>
										<input
											autoFocus
											placeholder="Label"
											name="query-name"
											value={configureQueryNameField}
											className="input-text control"
											type="text"
											onChange={e => {
												setConfigureQueryNameField(e.target.value);
											}}
										/>
										<div style={{ height: "10px" }} />
										<input
											placeholder="Query"
											name="query"
											value={configureQueryQueryField}
											className="input-text control"
											type="text"
											onChange={e => {
												setConfigureQueryQueryField(e.target.value);
											}}
										/>
										<div style={{ height: "10px" }} />
										<Checkbox
											name="repo-only"
											checked={configureQueryRepoOnlyField}
											onChange={() => setConfigureQueryRepoOnlyField(!configureQueryRepoOnlyField)}
										>
											Show results only from repos that are open in your editor
										</Checkbox>
									</div>
								</div>
								<ButtonRow>
									<Button
										isLoading={isLoadingTestPRs}
										disabled={configureQueryQueryField.length === 0}
										variant="secondary"
										onClick={() => fetchTestPRs(configureQueryQueryField)}
									>
										Test Query
									</Button>
									<Button disabled={configureQueryQueryField.length === 0} onClick={saveQuery}>
										Save Query
									</Button>
								</ButtonRow>
							</fieldset>
							{testPRSummaries.map(pr => {
								return (
									<Tooltip
										key={"pr-tt-" + pr.id}
										title={<PullRequestTooltip pr={pr} />}
										delay={1}
										placement="top"
									>
										<Row key={"pr-" + pr.id}>
											<div>
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
										</Row>
									</Tooltip>
								);
							})}
						</form>
					</Dialog>
				</Modal>
			)}
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
								<span className="wide-text">&nbsp;Refresh</span>
							</RoundedLink>
						</Tooltip>
						<H4>
							Pull Requests <sup className="subtle">(beta)</sup>
						</H4>
					</div>
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
					{queries.map((query, index) => {
						const prGroup = pullRequestGroups[index];
						return (
							<PRSummaryGroup>
								<PRSummaryName onClick={() => toggleQueryActive(index)}>
									{isLoadingPRs ? (
										<Icon name="sync" className="spin" />
									) : (
										<Icon
											name={query.active ? "chevron-down" : "chevron-right"}
											className="chevron"
										/>
									)}
									<span>{query.name}</span>
									<div className="actions" onClick={e => e.stopPropagation()}>
										<Icon
											title="Add New Query"
											delay={0.5}
											placement="bottom"
											name="plus"
											className="clickable"
											onClick={addQuery}
										/>
										<Icon
											title="Edit Query"
											delay={0.5}
											placement="bottom"
											name="pencil"
											className="clickable"
											onClick={() => editQuery(index)}
										/>
										<Icon
											title="Delete Query"
											delay={0.5}
											placement="bottom"
											name="x"
											className="clickable"
											onClick={() => deleteQuery(index)}
										/>
									</div>
								</PRSummaryName>
								{query.active &&
									prGroup &&
									prGroup.map(pr => {
										const selected = derivedState.repos.find(repo => {
											return (
												repo.currentBranch === pr.headRefName &&
												repo.name === pr.headRepository.name
											);
										});
										return (
											<Tooltip
												key={"pr-tt-" + pr.id}
												title={<PullRequestTooltip pr={pr} />}
												delay={1}
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
							</PRSummaryGroup>
						);
					})}
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
				</WideStatusSection>
			)}
		</>
	);
}
