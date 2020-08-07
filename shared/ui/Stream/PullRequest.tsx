import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { CodeStreamState } from "../store";
import styled from "styled-components";
import { CSMe } from "@codestream/protocols/api";
import { CreateCodemarkIcons } from "./CreateCodemarkIcons";
import ScrollBox from "./ScrollBox";
import Icon from "./Icon";
import { Tabs, Tab } from "../src/components/Tabs";
import Timestamp from "./Timestamp";
import copy from "copy-to-clipboard";
import { Link } from "./Link";
import { setCurrentPullRequest, setCurrentReview } from "../store/context/actions";
import CancelButton from "./CancelButton";
import { useDidMount } from "../utilities/hooks";
import { HostApi } from "../webview-api";
import {
	FetchThirdPartyPullRequestPullRequest,
	FetchThirdPartyPullRequestRequestType,
	FetchThirdPartyPullRequestResponse,
	GetReposScmRequestType,
	ReposScm,
	ExecuteThirdPartyTypedType
} from "@codestream/protocols/agent";
import {
	PRHeader,
	PRTitle,
	PRStatus,
	PRStatusButton,
	PRStatusMessage,
	PRAuthor,
	PRAction,
	PRBranch,
	PRBadge,
	PRPlusMinus,
	PREditTitle
} from "./PullRequestComponents";
import { LoadingMessage } from "../src/components/LoadingMessage";
import { Modal } from "./Modal";
import { bootstrapReviews } from "../store/reviews/actions";
import { PullRequestConversationTab } from "./PullRequestConversationTab";
import { PullRequestCommitsTab } from "./PullRequestCommitsTab";
import * as reviewSelectors from "../store/reviews/reducer";
import { PullRequestFilesChangedTab } from "./PullRequestFilesChangedTab";
import { FloatingLoadingMessage } from "../src/components/FloatingLoadingMessage";
import { Button } from "../src/components/Button";

const Root = styled.div`
	${Tabs} {
		margin: 10px 20px 10px 20px;
	}
	${Tab} {
		font-size: 13px;
		.icon {
			// vertical-align: -2px;
			display: inline-block;
			margin: 0 5px;
		}
	}
	@media only screen and (max-width: 700px) {
		.wide-text {
			display: none;
		}
	}
	a {
		text-decoration: none;
		&:hover {
			color: var(--text-color-info);
		}
	}
	.mine {
		background: rgba(90, 127, 255, 0.08);
	}
`;

export const PullRequest = () => {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const currentUser = state.users[state.session.userId!] as CSMe;
		const team = state.teams[state.context.currentTeamId];
		return {
			reviewsState: state.reviews,
			reviews: reviewSelectors.getAllReviews(state),
			currentUser,
			currentPullRequestId: state.context.currentPullRequestId,
			composeCodemarkActive: state.context.composeCodemarkActive,
			team
		};
	});

	const [activeTab, setActiveTab] = useState(1);
	const [ghRepo, setGhRepo] = useState<any>({});
	const [isLoadingPR, setIsLoadingPR] = useState(false);
	const [isLoadingMessage, setIsLoadingMessage] = useState("");
	const [pr, setPr] = useState<FetchThirdPartyPullRequestPullRequest | undefined>();
	const [openRepos, setOpenRepos] = useState<ReposScm[]>([]);
	const [editingTitle, setEditingTitle] = useState(false);
	const [savingTitle, setSavingTitle] = useState(false);
	const [title, setTitle] = useState("");

	const exit = async () => {
		await dispatch(setCurrentPullRequest());
	};

	const fetch = async (message?: string) => {
		if (message) setIsLoadingMessage(message);
		setIsLoadingPR(true);
		const r = (await HostApi.instance.send(FetchThirdPartyPullRequestRequestType, {
			providerId: "github*com",
			pullRequestId: derivedState.currentPullRequestId!
		})) as FetchThirdPartyPullRequestResponse;
		setGhRepo(r.repository);
		setPr(r.repository.pullRequest);
		setTitle(r.repository.pullRequest.title);
		setEditingTitle(false);
		setSavingTitle(false);
		setIsLoadingPR(false);
		setIsLoadingMessage("");
	};

	const saveTitle = async () => {
		setIsLoadingMessage("Saving Title...");
		setSavingTitle(true);

		await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
			method: "updatePullRequestTitle",
			providerId: "github*com",
			params: {
				pullRequestId: derivedState.currentPullRequestId!,
				title
			}
		});
		fetch();
	};

	const getROpenRepos = async () => {
		const response = await HostApi.instance.send(GetReposScmRequestType, {
			inEditorOnly: true
		});
		if (response && response.repositories) {
			setOpenRepos(response.repositories);
		}
	};

	const linkHijacker = (e: any) => {
		if (e && e.target.tagName === "A" && e.target.text === "Changes reviewed on CodeStream") {
			const review = Object.values(derivedState.reviews).find(
				_ => _.permalink === e.target.href.replace("?src=GitHub", "")
			);
			if (review) {
				e.preventDefault();
				e.stopPropagation();
				dispatch(setCurrentPullRequest(""));
				dispatch(setCurrentReview(review.id));
			}
		}
	};

	useEffect(() => {
		document.addEventListener("click", linkHijacker);
		return () => {
			document.removeEventListener("click", linkHijacker);
		};
	}, [derivedState.reviews]);

	useDidMount(() => {
		if (!derivedState.reviewsState.bootstrapped) {
			dispatch(bootstrapReviews());
		}
		fetch();
	});

	console.warn("PR: ", pr);
	console.warn("REPO: ", ghRepo);
	if (!pr) {
		return (
			<Modal verticallyCenter>
				<LoadingMessage>Loading Pull Request...</LoadingMessage>
			</Modal>
		);
	} else {
		const statusIcon = pr.state === "OPEN" || pr.state === "CLOSED" ? "pull-request" : "git-merge";
		const action = pr.merged ? "merged " : "wants to merge ";

		// console.log(pr.files);
		// console.log(pr.commits);
		return (
			<Root className="panel full-height">
				<CreateCodemarkIcons narrow onebutton />
				{isLoadingMessage && <FloatingLoadingMessage>{isLoadingMessage}</FloatingLoadingMessage>}
				<PRHeader>
					<PRTitle className={editingTitle ? "editing" : ""}>
						{editingTitle ? (
							<PREditTitle>
								<input
									id="title-input"
									name="title"
									value={title}
									className="input-text control"
									autoFocus
									type="text"
									onChange={e => setTitle(e.target.value)}
									placeholder=""
								/>
								<Button onClick={saveTitle} isLoading={savingTitle}>
									Save
								</Button>
								<Button
									variant="secondary"
									onClick={() => {
										setTitle("");
										setSavingTitle(false);
										setEditingTitle(false);
									}}
								>
									Cancel
								</Button>
							</PREditTitle>
						) : (
							<>
								{title || pr.title} <Link href={pr.url}>#{pr.number}</Link>
								<div className="action-buttons">
									<span>
										<Icon
											title="Edit Title"
											trigger={["hover"]}
											delay={1}
											onClick={() => {
												setTitle(pr.title);
												setEditingTitle(true);
											}}
											placement="bottom"
											className="clickable"
											name="pencil"
										/>
									</span>
									<span>
										<Icon
											title="Checkout"
											trigger={["hover"]}
											delay={1}
											onClick={() => fetch("Checkout...")}
											placement="bottom"
											className="clickable"
											name="repo"
										/>
									</span>
									<span>
										<Icon
											title="Reload"
											trigger={["hover"]}
											delay={1}
											onClick={() => fetch("Reloading...")}
											placement="bottom"
											className={`clickable spinnable ${isLoadingPR ? "spin" : ""}`}
											name="refresh"
										/>
									</span>
									<span>
										<CancelButton title="Close" className="clickable" onClick={exit} />
									</span>
								</div>{" "}
							</>
						)}
					</PRTitle>
					<PRStatus>
						<PRStatusButton
							variant={
								pr.state === "OPEN"
									? "success"
									: pr.state === "MERGED"
									? "merged"
									: pr.state === "CLOSED"
									? "destructive"
									: "primary"
							}
						>
							<Icon name={statusIcon} />
							{pr.state && pr.state.toLowerCase()}
						</PRStatusButton>
						<PRStatusMessage>
							<PRAuthor>{pr.author.login}</PRAuthor>
							<PRAction>
								{action} {pr.commits && pr.commits.totalCount} commits into{" "}
								<PRBranch>{pr.baseRefName}</PRBranch> from <PRBranch>{pr.headRefName}</PRBranch>{" "}
								<Icon
									title="Copy"
									placement="bottom"
									name="copy"
									className="clickable"
									onClick={e => copy(pr.baseRefName)}
								/>
							</PRAction>
							<Timestamp time={pr.createdAt} relative />
						</PRStatusMessage>
					</PRStatus>
				</PRHeader>
				{!derivedState.composeCodemarkActive && (
					<ScrollBox>
						<div className="channel-list vscroll">
							<Tabs style={{ marginTop: 0 }}>
								<Tab onClick={e => setActiveTab(1)} active={activeTab == 1}>
									<Icon name="comment" />
									<span className="wide-text">Conversation</span>
									<PRBadge>
										{pr.timelineItems && pr.timelineItems.nodes
											? pr.timelineItems.nodes.filter(
													_ => _.__typename && _.__typename.indexOf("Comment") > -1
											  ).length
											: 0}
									</PRBadge>
								</Tab>
								<Tab onClick={e => setActiveTab(2)} active={activeTab == 2}>
									<Icon name="git-commit" />
									<span className="wide-text">Commits</span>
									<PRBadge>{pr.commits.totalCount}</PRBadge>
								</Tab>
								{/*
					<Tab onClick={e => setActiveTab(3)} active={activeTab == 3}>
						<Icon name="check" />
						<span className="wide-text">Checks</span>
						<PRBadge>{pr.numChecks}</PRBadge>
					</Tab>
					 */}
								<Tab onClick={e => setActiveTab(4)} active={activeTab == 4}>
									<Icon name="plus-minus" />
									<span className="wide-text">Files Changed</span>
									<PRBadge>{pr.files.totalCount}</PRBadge>
								</Tab>

								<PRPlusMinus>
									<span className="added">
										+
										{!pr.files
											? 0
											: pr.files.nodes
													.map(_ => _.additions)
													.reduce((acc, val) => acc + val)
													.toString()
													.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
									</span>{" "}
									<span className="deleted">
										-
										{!pr.files
											? 0
											: pr.files.nodes
													.map(_ => _.deletions)
													.reduce((acc, val) => acc + val)
													.toString()
													.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
									</span>
								</PRPlusMinus>
							</Tabs>
							{activeTab === 1 && (
								<PullRequestConversationTab
									pr={pr}
									ghRepo={ghRepo}
									fetch={fetch}
									setIsLoadingMessage={setIsLoadingMessage}
								/>
							)}
							{activeTab === 2 && <PullRequestCommitsTab pr={pr} ghRepo={ghRepo} fetch={fetch} />}
							{activeTab === 4 && (
								<PullRequestFilesChangedTab
									key="files-changed"
									pr={pr}
									ghRepo={ghRepo}
									fetch={fetch}
								/>
							)}
						</div>
					</ScrollBox>
				)}
			</Root>
		);
	}
};
