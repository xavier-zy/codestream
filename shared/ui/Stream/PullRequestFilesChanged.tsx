import { CSReviewChangeset } from "@codestream/protocols/api";
import React, { useEffect } from "react";
import { ReviewPlus } from "@codestream/protocols/agent";
import { HostApi } from "..";
import * as path from "path-browserify";
import { ChangesetFile } from "./Review/ChangesetFile";
import { useSelector, useDispatch } from "react-redux";
import { CodeStreamState } from "@codestream/webview/store";
import { showDiff } from "@codestream/webview/store/reviews/actions";
import { Dispatch } from "../store/common";
import Icon from "./Icon";
import { safe } from "@codestream/webview/utils";
import { getById } from "@codestream/webview/store/repos/reducer";
import {
	ShowNextChangedFileNotificationType,
	ShowPreviousChangedFileNotificationType,
	EditorRevealRangeRequestType
} from "@codestream/protocols/webview";
import { WriteTextFileRequestType, ReadTextFileRequestType } from "@codestream/protocols/agent";
import { Range } from "vscode-languageserver-types";

// const VISITED_REVIEW_FILES = "review:changeset-file-list";
const NOW = new Date().getTime(); // a rough timestamp so we know when the file was visited
// const visitedFiles = localStore.get(VISITED_REVIEW_FILES) || {};

export const PullRequestFilesChanged = (props: {
	pr: any;
	filesChanged: any[];
	loading?: boolean;
	withTelemetry?: boolean;
}) => {
	const { pr, loading, filesChanged } = props;
	const dispatch = useDispatch<Dispatch>();
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
			numFiles: props.filesChanged.length
		};
	});

	const [visitedFiles, setVisitedFiles] = React.useState({ _latest: 0 });

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
	}, [pr, filesChanged]);

	const goDiff = async index => {
		if (index < 0) index = derivedState.numFiles - 1;
		if (index > derivedState.numFiles - 1) index = 0;
		const f = filesChanged[index];
		const visitedKey = [f.file].join(":");
		// const response = HostApi.instance.send(PRShowDiffRequestType, {
		// 	pr.id,
		// 	repoId,
		// 	f.file
		// });
		visitFile(visitedKey, index);

		if (props.withTelemetry && pr.id) {
			HostApi.instance.track("Review Diff Viewed", {
				"PR ID": pr.id
			});
		}
	};

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

		// if (changeset.repoId && props.repoRoots) {
		// 	const repoRoot = props.repoRoots[changeset.repoId];
		// 	const response = HostApi.instance.send(EditorRevealRangeRequestType, {
		// 		uri: path.join(repoRoot, f.file),
		// 		range: Range.create(0, 0, 0, 0)
		// 	});

		// 	if (props.withTelemetry && pr.id) {
		// 		HostApi.instance.track("PR File Viewed", {
		// 			"PR ID": pr.id
		// 		});
		// 	}
		// }
	};

	const latest = visitedFiles[key] ? visitedFiles[key]._latest : 0;

	const changedFiles = React.useMemo(() => {
		const files: any[] = [];

		// FIXME
		const sha = "sha";
		let index = 0;
		files.push(
			...props.filesChanged.map(f => {
				const visitedKey = [f.file].join(":");
				const uri = `codestream-diff://pr/${pr.id}/${sha}/right/${f.file}`;
				const selected = (derivedState.matchFile || "") == uri;
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

	return <>{changedFiles}</>;
};
