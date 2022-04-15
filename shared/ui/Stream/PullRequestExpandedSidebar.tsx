import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { CodeStreamState } from "../store";
import styled, { ThemeProvider } from "styled-components";
import Icon from "./Icon";
import { setCurrentPullRequest } from "../store/context/actions";
import { FetchThirdPartyPullRequestPullRequest } from "@codestream/protocols/agent";
import { PullRequestFilesChangedTab } from "./PullRequestFilesChangedTab";
import { Skeleton } from "./Skeleton";
import { getPreferences } from "../store/users/reducer";
import { Row } from "./CrossPostIssueControls/IssueDropdown";

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

	const handleClick = () => {
		const { pullRequest } = props;
		dispatch(setCurrentPullRequest(pullRequest.providerId, pullRequest.id, "", "", "details"));
	};

	return (
		<>
			<Row onClick={handleClick} style={{ paddingLeft: "45px" }}>
				<Icon name="git-branch" />
				PR Details
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
