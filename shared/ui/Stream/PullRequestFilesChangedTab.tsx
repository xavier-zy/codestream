import React, { useState } from "react";
import { isFeatureEnabled } from "../store/apiVersioning/reducer";
import Icon from "./Icon";
import Timestamp from "./Timestamp";
import Tooltip from "./Tooltip";
import { PRHeadshotName } from "../src/components/HeadshotName";
import { PRContent } from "./PullRequestComponents";
import styled from "styled-components";
import { ExecuteThirdPartyTypedType } from "@codestream/protocols/agent";
import { useDidMount } from "../utilities/hooks";
import { HostApi } from "../webview-api";
import { useSelector } from "react-redux";
import { CodeStreamState } from "../store";
import { PullRequestFilesChanged } from "./PullRequestFilesChanged";
import { FileStatus } from "@codestream/protocols/api";
import { LoadingMessage } from "../src/components/LoadingMessage";

const PRCommitContent = styled.div`
	margin: 0 20px 20px 40px;
	position: relative;
`;

const STATUS_MAP = {
	modified: FileStatus.modified
};

export const PullRequestFilesChangedTab = props => {
	const { pr, ghRepo } = props;
	const derivedState = useSelector((state: CodeStreamState) => {
		return {
			currentPullRequestId: state.context.currentPullRequestId
		};
	});

	const [isLoading, setIsLoading] = useState(true);
	const [filesChanged, setFilesChanged] = useState<any[]>([]);

	useDidMount(() => {
		setIsLoading(true);
		(async () => {
			const data = await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
				method: "getPullRequestFilesChanged",
				providerId: "github*com",
				params: {
					pullRequestId: derivedState.currentPullRequestId
				}
			});
			const filesChanged = data.map(_ => {
				return {
					linesAdded: _.additions,
					linesRemoved: _.deletions,
					file: _.filename,
					sha: _.sha,
					status: STATUS_MAP[_.status]
				};
			});
			setFilesChanged(filesChanged);
			setIsLoading(false);
		})();
	});

	if (isLoading)
		return (
			<div style={{ marginTop: "100px" }}>
				<LoadingMessage>Loading Changed Files...</LoadingMessage>
			</div>
		);

	if (!filesChanged || !filesChanged.length) return null;

	const renderPatch = (patch: string) => {
		if (!patch) return null;
		return patch.split("\n").map(_ => {
			if (_.indexOf("@@ ") === 0) {
				return (
					<div
						style={{
							background: "#f1f8ff",
							fontFamily: "monospace",
							color: "#24292e",
							padding: "10px 0 10px 0"
						}}
					>
						{_}
					</div>
				);
			} else if (_.indexOf("+") === 0) {
				return (
					<div
						style={{
							background: "#e6ffed",
							fontFamily: "monospace",
							color: "#24292e",
							padding: "5px 0 0px 5px"
						}}
					>
						{_}
					</div>
				);
			} else if (_.indexOf("-") === 0) {
				return (
					<div
						style={{
							background: "#ffeef0",
							fontFamily: "monospace",
							color: "#24292e",
							padding: "5px 0 0px 5px"
						}}
					>
						{_}
					</div>
				);
			} else {
				return (
					<div
						style={{
							background: "#fff",
							fontFamily: "monospace",
							color: "#24292e",
							padding: "5px 0 0px 5px"
						}}
					>
						&nbsp;{_}
					</div>
				);
			}
		});
	};

	return (
		<PRCommitContent>
			<PullRequestFilesChanged pr={pr} filesChanged={filesChanged} />
		</PRCommitContent>
	);

	// return (
	// 	<PRCommitContent>
	// 		<div>
	// 			{filesChanged.map(_ => {
	// 				return (
	// 					<PRCommitCard>
	// 						<h1>{_.filename}</h1>
	// 						{/*<div>{renderPatch(_.patch)}</div>*/}
	// 					</PRCommitCard>
	// 				);
	// 			})}
	// 		</div>
	// 	</PRCommitContent>
	// );
};
