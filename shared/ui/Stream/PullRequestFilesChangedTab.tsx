import React, { useState } from "react";
import { isFeatureEnabled } from "../store/apiVersioning/reducer";
import Icon from "./Icon";
import Timestamp from "./Timestamp";
import Tooltip from "./Tooltip";
import { PRHeadshotName } from "../src/components/HeadshotName";
import { markdownify } from "./Markdowner";
import { PRContent } from "./PullRequestComponents";
import styled from "styled-components";
import { ExecuteThirdPartyTypedType } from "@codestream/protocols/agent";
import { useDidMount } from "../utilities/hooks";
import { HostApi } from "../webview-api";
import { useSelector } from "react-redux";
import { CodeStreamState } from "../store";

const PRCommitContent = styled.div`
	margin: 0 20px 20px 20px;
	position: relative;
`;

export const PRCommitCard = styled.div`
	position: relative;
	border: 1px solid;
	border-bottom: none;
	border-color: var(--base-border-color);
	background: var(--app-background-color);
	.vscode-dark &,
	&.add-comment {
		background: var(--base-background-color);
	}
	padding: 10px 15px 10px 15px;
	margin-left: 30px;
	z-index: 2;
	width: auto;
	h1 {
		font-size: 15px;
		font-weight: normal;
		margin: 0 0 8px 0;
		padding-right: 120px;
	}
	p {
		margin: 0;
		color: var(--text-color-subtle);
	}
	&:first-child {
		border-radius: 5px 5px 0 0;
	}
	&:last-child {
		border-radius: 0 0 5px 5px;
		border: 1px solid var(--base-border-color);
	}
`;

export const PullRequestFilesChangedTab = props => {
	const { pr, ghRepo } = props;
	const derivedState = useSelector((state: CodeStreamState) => {
		return {
			currentPullRequestId: state.context.currentPullRequestId
		};
	});

	const [filesChanged, setFilesChanged] = useState<any[]>([]);

	useDidMount(() => {
		(async () => {
			const data = await HostApi.instance.send(new ExecuteThirdPartyTypedType<any, any>(), {
				method: "getPullRequestFilesChanged",
				providerId: "github*com",
				params: {
					pullRequestId: derivedState.currentPullRequestId
				}
			});
			setFilesChanged(data);
		})();
	});

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
			<div>
				{filesChanged.map(_ => {
					return (
						<PRCommitCard>
							<h1>{_.filename}</h1>
							{/*<div>{renderPatch(_.patch)}</div>*/}
						</PRCommitCard>
					);
				})}
			</div>
		</PRCommitContent>
	);
};
