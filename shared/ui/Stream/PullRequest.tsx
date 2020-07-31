import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { CodeStreamState } from "../store";
import styled from "styled-components";
import { CSMe } from "@codestream/protocols/api";
import { isFeatureEnabled } from "../store/apiVersioning/reducer";
import { CreateCodemarkIcons } from "./CreateCodemarkIcons";
import ScrollBox from "./ScrollBox";
import Icon from "./Icon";
import { Tabs, Tab } from "../src/components/Tabs";
import Timestamp from "./Timestamp";
import copy from "copy-to-clipboard";
import { Link } from "./Link";
<<<<<<< HEAD
import Tag from "./Tag";
import { setCurrentPullRequest, setCurrentReview } from "../store/context/actions";
=======
import { setCurrentPullRequest } from "../store/context/actions";
>>>>>>> commits tab
import CancelButton from "./CancelButton";
import { useDidMount } from "../utilities/hooks";
import { HostApi } from "../webview-api";
import {
	FetchThirdPartyPullRequestPullRequest,
	FetchThirdPartyPullRequestRequestType,
	FetchThirdPartyPullRequestResponse
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
	PRPlusMinus
} from "./PullRequestComponents";
import { LoadingMessage } from "../src/components/LoadingMessage";
import { Modal } from "./Modal";
import { DropdownButton } from "./Review/DropdownButton";
import { bootstrapReviews } from "../store/reviews/actions";
import { PullRequestConversationTab } from "./PullRequestConversationTab";
import { PullRequestCommitsTab } from "./PullRequestCommitsTab";

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
`;

export const PullRequest = () => {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const currentUser = state.users[state.session.userId!] as CSMe;
		const team = state.teams[state.context.currentTeamId];

		return {
			reviewsState: state.reviews,
			reviews: state.reviews.reviews,
			currentUser,
			currentPullRequestId: state.context.currentPullRequestId,
			team
		};
	});

	const [activeTab, setActiveTab] = useState(1);
	const [ghRepo, setGhRepo] = useState<any>({});
	const [isLoadingPR, setIsLoadingPR] = useState(false);
	const [pr, setPr] = useState<FetchThirdPartyPullRequestPullRequest | undefined>();

	const exit = async () => {
		await dispatch(setCurrentPullRequest());
	};

	const fetch = async () => {
		setIsLoadingPR(true);
		const r = (await HostApi.instance.send(FetchThirdPartyPullRequestRequestType, {
			providerId: "github*com",
			pullRequestId: derivedState.currentPullRequestId!
		})) as FetchThirdPartyPullRequestResponse;
		setGhRepo(r.repository);
		setPr(r.repository.pullRequest);
		setIsLoadingPR(false);
	};

	const linkHijacker = (e: any) => {
		if (e && e.target.tagName === "A" && e.target.text === "Changes reviewed on CodeStream") {
			// TOOD this doesn't seem to always work???
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

	useDidMount(() => {
		if (!derivedState.reviewsState.bootstrapped) {
			// TOOD this doesn't seem to always work???
			dispatch(bootstrapReviews());
		}
		fetch();

		document.addEventListener("click", linkHijacker);
		return () => {
			document.removeEventListener("click", linkHijacker);
		};
	});

	console.warn(pr);
	if (!pr) {
		return (
			<Modal verticallyCenter>
				<LoadingMessage>Loading Pull Request...</LoadingMessage>
			</Modal>
		);
	} else {
		const statusIcon = pr.state == "OPEN" ? "pull-request" : "git-merge";
		const action = pr.merged ? "merged " : "wants to merge ";

		// console.log(pr.files);
		// console.log(pr.commits);
		return (
			<Root className="panel full-height">
				<CreateCodemarkIcons narrow />
				<PRHeader>
					<PRTitle>
						{pr.title} <Link href={pr.url}>#{pr.number}</Link>
						<Icon
							onClick={fetch}
							className={`reload-button clickable ${isLoadingPR ? "spin" : "spinnable"}`}
							name="sync"
						/>
						<CancelButton className="clickable" onClick={exit} />
					</PRTitle>
					<PRStatus>
						<PRStatusButton variant={pr.state == "OPEN" ? "success" : "primary"}>
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
										: pr.files.nodes.map(_ => _.additions).reduce((acc, val) => acc + val)}
								</span>{" "}
								<span className="deleted">
									-
									{!pr.files
										? 0
										: pr.files.nodes.map(_ => _.deletions).reduce((acc, val) => acc + val)}
								</span>
							</PRPlusMinus>
						</Tabs>
						{activeTab === 1 && (
							<PullRequestConversationTab pr={pr} ghRepo={ghRepo} fetch={fetch} />
						)}
						{activeTab === 2 && <PullRequestCommitsTab pr={pr} ghRepo={ghRepo} fetch={fetch} />}
					</div>
				</ScrollBox>
			</Root>
		);
	}
};
