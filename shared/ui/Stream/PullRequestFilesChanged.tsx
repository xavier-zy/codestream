import React, { useEffect, useState, useCallback } from "react";
import {
	FetchThirdPartyPullRequestPullRequest,
	FetchAllRemotesRequestType,
	GetReposScmRequestType,
	FetchForkPointRequestType
} from "@codestream/protocols/agent";
import { HostApi } from "..";
import { ChangesetFile } from "./Review/ChangesetFile";
import { useSelector } from "react-redux";
import { CodeStreamState } from "@codestream/webview/store";
import Icon from "./Icon";
import {
	ShowNextChangedFileNotificationType,
	ShowPreviousChangedFileNotificationType,
	EditorRevealRangeRequestType
} from "@codestream/protocols/webview";
import { WriteTextFileRequestType, ReadTextFileRequestType } from "@codestream/protocols/agent";
import { useDidMount } from "../utilities/hooks";
import { CompareLocalFilesRequestType } from "../ipc/host.protocol";
import * as path from "path-browserify";
import { Range } from "vscode-languageserver-types";
import styled from "styled-components";
import { parseCodeStreamDiffUri } from "../store/codemarks/actions";
import { LocateRepoButton } from "./LocateRepoButton";
import { Link } from "./Link";

const MetaIcons = styled.div`
	margin-bottom: 10px;
	height: 14px;
	.icon {
		margin-right: 5px;
	}
`;

// const VISITED_REVIEW_FILES = "review:changeset-file-list";
const NOW = new Date().getTime(); // a rough timestamp so we know when the file was visited
// const visitedFiles = localStore.get(VISITED_REVIEW_FILES) || {};

export const PullRequestFilesChanged = (props: {
	pr: FetchThirdPartyPullRequestPullRequest;
	filesChanged: any[];
	loading?: boolean;
	withTelemetry?: boolean;
}) => {
	const { pr, loading, filesChanged } = props;
	// const dispatch = useDispatch<Dispatch>();
	const [repoId, setRepoId] = useState("");
	const derivedState = useSelector((state: CodeStreamState) => {
		const userId = state.session.userId || "";
		const matchFile =
			state.context.currentPullRequestId &&
			state.editorContext.scmInfo &&
			state.editorContext.scmInfo.uri &&
			state.editorContext.scmInfo.uri.startsWith("codestream-diff://")
				? state.editorContext.scmInfo.uri
				: "";

		return {
			matchFile,
			userId,
			repos: state.repos,
			// TODO more solid filtering
			currentRepo: Object.values(state.repos).find(_ => _.name === props.pr.repository.name),
			numFiles: props.filesChanged.length,
			isInVscode: state.ide.name === "VSC"
		};
	});

	const [visitedFiles, setVisitedFiles] = React.useState({ _latest: 0 });
	const [currentRepoRoot, setCurrentRepoRoot] = React.useState("");
	const [forkPointSha, setForkPointSha] = React.useState("");

	const visitFile = (visitedKey: string, index: number) => {
		const newVisitedFiles = { ...visitedFiles, [visitedKey]: NOW, _latest: index };
		saveVisitedFiles(newVisitedFiles, key);
		setVisitedFiles(newVisitedFiles);
	};

	let key = "all";

	const saveVisitedFiles = (newVisitedFiles, key) => {
		HostApi.instance.send(WriteTextFileRequestType, {
			path: `pr-${pr.id}.json`,
			contents: JSON.stringify(newVisitedFiles, null, 4)
		});
	};

	useDidMount(() => {
		if (derivedState.currentRepo) {
			HostApi.instance.send(FetchAllRemotesRequestType, {
				repoId: derivedState.currentRepo.id!
			});
			(async () => {
				const forkPointResponse = await HostApi.instance.send(FetchForkPointRequestType, {
					repoId: derivedState.currentRepo!.id!,
					baseSha: props.pr.baseRefOid,
					headSha: props.pr.headRefOid
				});
				if (forkPointResponse && forkPointResponse.sha) {
					setForkPointSha(forkPointResponse.sha);
				} else {
					console.warn("Could not find fork point");
				}
			})();
		}
	});

	useEffect(() => {
		(async () => {
			const response = (await HostApi.instance.send(ReadTextFileRequestType, {
				path: `pr-${pr.id}.json`
			})) as any;

			try {
				setVisitedFiles(JSON.parse(response.contents || "{}"));
			} catch (ex) {
				console.warn("Error parsing JSON data: ", response.contents);
			}
		})();
	}, [pr, filesChanged]);

	useEffect(() => {
		const disposables = [
			HostApi.instance.on(ShowNextChangedFileNotificationType, nextFile),
			HostApi.instance.on(ShowPreviousChangedFileNotificationType, prevFile)
		];

		return () => disposables.forEach(disposable => disposable.dispose());
	}, [pr, filesChanged, visitedFiles]);

	const goDiff = useCallback(
		i => {
			(async index => {
				if (index < 0) index = derivedState.numFiles - 1;
				if (index > derivedState.numFiles - 1) index = 0;
				const f = filesChanged[index];
				const visitedKey = [f.file].join(":");

				console.warn(props.pr.baseRefOid + " vs ", props.pr.headRefOid);
				await HostApi.instance.send(CompareLocalFilesRequestType, {
					baseBranch: props.pr.baseRefName,
					baseSha: forkPointSha,
					headBranch: props.pr.headRefName,
					headSha: props.pr.headRefOid,
					filePath: f.file,
					repoId: derivedState.currentRepo!.id!,
					context: {
						pullRequest: {
							providerId: pr.providerId,
							id: pr.id
						}
					}
				});

				visitFile(visitedKey, index);

				if (props.withTelemetry && pr.id) {
					HostApi.instance.track("Review Diff Viewed", {
						"PR ID": pr.id
					});
				}
			})(i);
		},
		[repoId, visitedFiles, forkPointSha]
	);

	const nextFile = () => {
		if (!visitedFiles) goDiff(0);
		else if (visitedFiles._latest == null) goDiff(0);
		else goDiff(visitedFiles._latest + 1);
	};

	const prevFile = () => {
		if (!visitedFiles) goDiff(-1);
		else if (visitedFiles._latest == null) goDiff(-1);
		else goDiff(visitedFiles._latest - 1);
	};

	const openFile = async index => {
		if (index < 0) index = derivedState.numFiles - 1;
		if (index > derivedState.numFiles - 1) index = 0;
		const f = filesChanged[index];
		const visitedKey = [f.file].join(":");

		let repoRoot = currentRepoRoot;
		if (!repoRoot) {
			const response = await HostApi.instance.send(GetReposScmRequestType, {
				inEditorOnly: true
			});
			if (!response.repositories) return;
			const currentRepoInfo = response.repositories.find(
				r => r.id === derivedState.currentRepo!.id
			);
			if (currentRepoInfo) {
				setCurrentRepoRoot(currentRepoInfo.path);
				repoRoot = currentRepoInfo.path;
			}
		}

		const response = HostApi.instance.send(EditorRevealRangeRequestType, {
			uri: path.join(repoRoot, f.file),
			range: Range.create(0, 0, 0, 0)
		});

		if (props.withTelemetry && pr.id) {
			HostApi.instance.track("PR File Viewed", {
				"PR ID": pr.id
			});
		}
	};

	const latest = visitedFiles[key] ? visitedFiles[key]._latest : 0;

	const changedFiles = React.useMemo(() => {
		const files: any[] = [];

		let index = 0;
		const parsed = parseCodeStreamDiffUri(derivedState.matchFile || "");
		files.push(
			...props.filesChanged.map(f => {
				const visitedKey = [f.file].join(":");

				const selected = parsed && parsed.path == f.file;
				const visited = visitedFiles[visitedKey];
				if (selected && !visited) {
					visitFile(visitedKey, index);
				}

				let icon;
				// if we're loading, show a spinner
				if (loading) icon = "sync";
				// this file is currently selected, and visible in diff view
				else if (selected) icon = "arrow-right";
				// this file has been visitied during the review
				else if (visited) icon = "ok";
				// not yet visited, but part of the review
				else icon = "circle";

				const iconClass = loading ? "file-icon spin" : "file-icon";
				// i is a temp variable to create the correct scope binding
				const i = index++;
				return (
					<ChangesetFile
						selected={selected}
						icon={icon && <Icon name={icon} className={iconClass} />}
						onClick={async e => {
							e.preventDefault();
							goDiff(i);
						}}
						actionIcons={
							!loading && (
								<div className="actions">
									<Icon
										name="goto-file"
										className="clickable action"
										title="Open File"
										placement="left"
										delay={1}
										onClick={async e => {
											e.stopPropagation();
											e.preventDefault();
											openFile(i);
										}}
									/>
								</div>
							)
						}
						key={i + ":" + f.file}
						{...f}
					/>
				);
			})
		);
		return files;
	}, [pr, loading, derivedState.matchFile, latest, visitedFiles]);

	if (!derivedState.currentRepo) {
		return (
			<div style={{ marginTop: "10px" }}>
				<Icon name="alert" className="margin-right" />
				Repo <span className="monospace highlight">{pr.repository.name}</span> not found in your
				editor. Diffs are visible under Diff Hunks button above, or{" "}
				<Link href={pr.repository.url}>clone the repo</Link>.
			</div>
		);
	}
	if (changedFiles.length > 1) {
		const isMacintosh = navigator.appVersion.includes("Macintosh");
		const nextFileKeyboardShortcut = () => (isMacintosh ? `⌥ F6` : "Alt-F6");
		const previousFileKeyboardShortcut = () => (isMacintosh ? `⇧ ⌥ F6` : "Shift-Alt-F6");
		return (
			<>
				<MetaIcons>
					<Icon
						onClick={nextFile}
						name="arrow-down"
						className="clickable"
						placement="top"
						delay={1}
						title={
							derivedState.isInVscode && (
								<span>
									Next File <span className="keybinding">{nextFileKeyboardShortcut()}</span>
								</span>
							)
						}
					/>
					<Icon
						onClick={prevFile}
						name="arrow-up"
						className="clickable"
						placement="top"
						delay={1}
						title={
							derivedState.isInVscode && (
								<span>
									Previous File <span className="keybinding">{previousFileKeyboardShortcut()}</span>
								</span>
							)
						}
					/>
				</MetaIcons>
				{changedFiles}
			</>
		);
	} else {
		return <>{changedFiles}</>;
	}
};
