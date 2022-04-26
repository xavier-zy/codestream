import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { CodeStreamState } from "../store";
import styled from "styled-components";
import Icon from "./Icon";
import { setCurrentPullRequest } from "../store/context/actions";
import { FetchThirdPartyPullRequestPullRequest } from "@codestream/protocols/agent";
import { PullRequestFilesChangedTab } from "./PullRequestFilesChangedTab";
import { getPreferences } from "../store/users/reducer";
import { Row } from "./CrossPostIssueControls/IssuesPane";
import { openModal } from "../store/context/actions";
import { WebviewModals } from "../ipc/webview.protocol.common";

export const ReviewButton = styled.div`
	color: white;
	background-color: #24a100;
	width: 50px;
	text-align: center;
	margin-left: auto;
	border-radius: 5px;
`;

// @TODO: update with more specific types
interface PullRequestExpandedSidebarProps {
	pullRequest: any;
	thirdPartyPrObject?: any;
	loadingThirdPartyPrObject: boolean;
	fetchOnePR?: any;
	prCommitsRange?: any;
	setPrCommitsRange?: any;
}

export const PullRequestExpandedSidebar = (props: PullRequestExpandedSidebarProps) => {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		return {
			viewPreference: getPreferences(state).pullRequestView || "auto"
		};
	});

	const handleRowClick = e => {
		e.stopPropagation();
		const { pullRequest } = props;
		dispatch(setCurrentPullRequest(pullRequest.providerId, pullRequest.id, "", "", "details"));
	};

	const handleReviewClick = e => {
		e.stopPropagation();
		dispatch(openModal(WebviewModals.FinishReview));
	};

	return (
		<>
			<Row onClick={e => handleRowClick(e)} style={{ padding: "4px 0 4px 45px" }}>
				<div>
					<Icon name="git-branch" />
					PR Details
				</div>
				<div>
					<ReviewButton onClick={e => handleReviewClick(e)}>
						<span className="wide-text">Review</span>
					</ReviewButton>
				</div>
			</Row>
			{props.loadingThirdPartyPrObject && !props.thirdPartyPrObject && (
				<div style={{ paddingLeft: "45px" }}>
					Loading... <Icon className="spin" name="sync" />
				</div>
			)}
			{props.thirdPartyPrObject && (
				<>
					<PullRequestFilesChangedTab
						key="files-changed"
						pr={props.thirdPartyPrObject as FetchThirdPartyPullRequestPullRequest}
						fetch={() => {
							props.fetchOnePR(props.thirdPartyPrObject.providerId, props.thirdPartyPrObject.id);
						}}
						setIsLoadingMessage={() => {}}
						sidebarView
						prCommitsRange={props.prCommitsRange}
						setPrCommitsRange={props.setPrCommitsRange}
					/>
				</>
			)}
		</>
	);
};
