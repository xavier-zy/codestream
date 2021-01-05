import { getProviderPullRequestRepo } from "@codestream/webview/store/providerPullRequests/reducer";
import { DropdownButton } from "@codestream/webview/Stream/Review/DropdownButton";
import React, { useState, useEffect, useMemo } from "react";
import { useDidMount } from "../utilities/hooks";
import { useSelector, useDispatch } from "react-redux";
import { CodeStreamState } from "../store";
import { FileStatus } from "@codestream/protocols/api";
import { LoadingMessage } from "../src/components/LoadingMessage";
import { getPullRequestCommits, getPullRequestFiles } from "../store/providerPullRequests/actions";
import { PullRequestFilesChangedList } from "./PullRequestFilesChangedList";
import { HostApi } from "../webview-api";
import { FetchThirdPartyPullRequestPullRequest } from "@codestream/protocols/agent";

const STATUS_MAP = {
	modified: FileStatus.modified
};

export const PullRequestFilesChangedTab = (props: {
	pr: FetchThirdPartyPullRequestPullRequest;
	fetch: Function;
	setIsLoadingMessage: Function;
}) => {
	const { pr } = props;
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		return {
			providerPullRequests: state.providerPullRequests.pullRequests,
			pullRequestFilesChangedMode: state.preferences.pullRequestFilesChangedMode || "files",
			currentRepo: getProviderPullRequestRepo(state),
			currentPullRequestId: state.context.currentPullRequest
				? state.context.currentPullRequest.id
				: undefined
		};
	});

	const [isLoading, setIsLoading] = useState(true);
	const [filesChanged, setFilesChanged] = useState<any[]>([]);
	const [prCommits, setPrCommits] = useState<any[]>([]);
	const [prCommitsRange, setPrCommitsRange] = useState<string[]>([]);

	const _mapData = data => {
		const filesChanged = data.map(_ => {
			return {
				..._,
				linesAdded: _.additions,
				linesRemoved: _.deletions,
				file: _.filename,
				sha: _.sha,
				status: STATUS_MAP[_.status]
			};
		});
		filesChanged.sort((a, b) => a.file.localeCompare(b.file));
		setFilesChanged(filesChanged);
		setIsLoading(false);
	};

	const _mapCommitsData = data => {
		setPrCommits(data);
	};

	useEffect(() => {
		// re-render if providerPullRequests changes
		(async () => {
			if (prCommitsRange.length > 0 && derivedState.currentRepo) {
				const data = await dispatch(
					getPullRequestFiles(
						pr.providerId,
						derivedState.currentPullRequestId!,
						prCommitsRange,
						derivedState.currentRepo.id
					)
				);
				_mapData(data);
			} else {
				const data = await dispatch(
					getPullRequestFiles(pr.providerId, derivedState.currentPullRequestId!)
				);
				_mapData(data);
			}
		})();
	}, [derivedState.providerPullRequests, prCommitsRange]);

	useDidMount(() => {
		setIsLoading(true);
		(async () => {
			const prCommitsData = await dispatch(
				getPullRequestCommits(pr.providerId, derivedState.currentPullRequestId!)
			);
			_mapCommitsData(prCommitsData);
			const data = await dispatch(
				getPullRequestFiles(pr.providerId, derivedState.currentPullRequestId!)
			);
			_mapData(data);
		})();
	});

	const commitBased = useMemo(() => prCommitsRange.length > 0, [prCommitsRange]);
	const baseRef = useMemo(() => {
		if (prCommitsRange.length === 1) {
			let commitIndex;
			prCommits.map((commit, index) => {
				if (commit.oid === prCommitsRange[0]) {
					commitIndex = index - 1;
				}
			});
			if (commitIndex >= 0) {
				return prCommits[commitIndex].oid;
			}
			return pr.baseRefOid;
		}
		if (prCommitsRange.length > 1) return prCommitsRange[0];
		return pr.baseRefOid;
	}, [prCommitsRange]);

	if (isLoading)
		return (
			<div style={{ marginTop: "100px" }}>
				<LoadingMessage>Loading Changed Files...</LoadingMessage>
			</div>
		);

	if (!filesChanged || !filesChanged.length) return null;

	const dropdownLabel =
		prCommitsRange.length === 0 ? "Changes from all commits" : "Changes from 1 commit";

	const dropdownItems = [
		{
			label: "Changes from all commits",
			action: () => {
				setPrCommitsRange([]);
			}
		},
		{ label: "-" }
	];
	prCommits &&
		prCommits.map(_ => {
			dropdownItems.push({
				label: _.message,
				action: () => {
					setPrCommitsRange([_.oid]);
				}
			});
		});

	return (
		<div style={{ position: "relative", margin: "0 0 20px 20px" }}>
			{derivedState.currentRepo && (
				<div style={{ margin: "0 0 10px 0" }}>
					<DropdownButton variant="text" items={dropdownItems}>
						{dropdownLabel}
					</DropdownButton>
				</div>
			)}
			<PullRequestFilesChangedList
				pr={pr}
				filesChanged={filesChanged}
				repositoryName={pr.repository && pr.repository.name}
				baseRef={baseRef}
				baseRefName={commitBased ? pr.headRefName : pr.baseRefName}
				headRef={commitBased ? prCommitsRange[prCommitsRange.length - 1] : pr.headRefOid}
				headRefName={pr.headRefName}
				isLoading={isLoading}
				fetch={props.fetch!}
				setIsLoadingMessage={props.setIsLoadingMessage!}
				commitBased={commitBased}
			/>
		</div>
	);
};
