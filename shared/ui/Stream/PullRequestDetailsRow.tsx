import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { CodeStreamState } from "../store";
import styled, { ThemeProvider } from "styled-components";
import { CSMe } from "@codestream/protocols/api";
import { CreateCodemarkIcons } from "./CreateCodemarkIcons";
import ScrollBox from "./ScrollBox";
import Icon from "./Icon";
import { Tabs, Tab } from "../src/components/Tabs";
import Timestamp from "./Timestamp";
import copy from "copy-to-clipboard";
import { Link } from "./Link";
import {
	clearCurrentPullRequest,
	setCurrentPullRequest,
	setCurrentReview
} from "../store/context/actions";
import { useDidMount } from "../utilities/hooks";
import { HostApi } from "../webview-api";
import {
	FetchThirdPartyPullRequestPullRequest,
	GetReposScmRequestType,
	ReposScm,
	SwitchBranchRequestType,
	DidChangeDataNotificationType,
	ChangeDataType,
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
	PRPlusMinus,
	PREditTitle,
	PRActionButtons,
	PRSubmitReviewButton,
	PRIAmRequested
} from "./PullRequestComponents";
import { LoadingMessage } from "../src/components/LoadingMessage";
import { bootstrapReviews } from "../store/reviews/actions";
import { PullRequestConversationTab } from "./PullRequestConversationTab";
import { PullRequestCommitsTab } from "./PullRequestCommitsTab";
import * as reviewSelectors from "../store/reviews/reducer";
import { PullRequestFilesChangedTab } from "./PullRequestFilesChangedTab";
import { FloatingLoadingMessage } from "../src/components/FloatingLoadingMessage";
import { Button } from "../src/components/Button";
import Tooltip from "./Tooltip";
import { PullRequestFinishReview } from "./PullRequestFinishReview";
import {
	getPullRequestConversationsFromProvider,
	clearPullRequestFiles,
	getPullRequestConversations,
	clearPullRequestCommits,
	api,
	updatePullRequestTitle,
	setProviderError
} from "../store/providerPullRequests/actions";
import {
	getCurrentProviderPullRequest,
	getCurrentProviderPullRequestLastUpdated,
	getProviderPullRequestRepoObject
} from "../store/providerPullRequests/reducer";
import { confirmPopup } from "./Confirm";
import { PullRequestFileComments } from "./PullRequestFileComments";
import { InlineMenu } from "../src/components/controls/InlineMenu";
import { getPreferences } from "../store/users/reducer";
import { setUserPreference } from "./actions";
import { GHOST } from "./PullRequestTimelineItems";
import { logError } from "../logger";
import { Row } from "./CrossPostIssueControls/IssueDropdown";

const Root = styled.div`
	display: flex;
	.pr-detail-row {
		padding-left: 60px !important;
	}
`;

interface PullRequestDetailsRowProps {
	pullRequest: any;
}

export const PullRequestDetailsRow = (props: PullRequestDetailsRowProps) => {
	// const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		return {
			viewPreference: getPreferences(state).pullRequestView || "auto"
		};
	});

	// const [activeTab, setActiveTab] = useState(1);
	// const [scrollPosition, setScrollPosition] = useState([]);
	// const [ghRepo, setGhRepo] = useState<any>([]);

	return (
		<Row style={{ paddingLeft: "60px" }}>
			{" "}
			<Icon name="git-branch" />
			PR Details
		</Row>
	);
};
