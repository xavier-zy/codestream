import React from "react";
import { useDispatch, useSelector } from "react-redux";
import ScrollBox from "./ScrollBox";
import { includes as _includes, sortBy as _sortBy, last as _last } from "lodash-es";
import { CodeStreamState } from "../store";
import { useDidMount } from "../utilities/hooks";
import { HostApi } from "../webview-api";
import { mapFilter } from "../utils";
import { CodemarkType } from "@codestream/protocols/api";
import { PanelHeader } from "../src/components/PanelHeader";
import { CreateCodemarkIcons } from "./CreateCodemarkIcons";
import { createSelector } from "reselect";

const getSearchableCodemarks = createSelector(
	(state: CodeStreamState) => state.codemarks,
	codemarksState => {
		return mapFilter(Object.values(codemarksState), codemark => {
			if (
				!codemark.isChangeRequest &&
				(codemark.type === CodemarkType.Comment || codemark.type === CodemarkType.Issue)
			) {
				return codemark;
			}
			return;
		});
	}
);

export const ExportPanel = () => {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const codemarks = useSelector(getSearchableCodemarks);

		return { codemarks, webviewFocused: state.context.hasFocus };
	});

	const [text, setText] = React.useState("");

	useDidMount(() => {
		if (derivedState.webviewFocused)
			HostApi.instance.track("Page Viewed", { "Page Name": "Export" });
	});

	const insertText = () => {};

	return (
		<div className="panel full-height activity-panel">
			<CreateCodemarkIcons />
			<PanelHeader title="Export"></PanelHeader>
			<ScrollBox>
				<div className="channel-list vscroll">
					<pre className="monospace" style={{ margin: "20px" }}>
						// repo,file,commitSha,location,date,author,id,parentId,type,title,body,assignees
						<br />
						{derivedState.codemarks.map(codemark => {
							return (
								<>
									{codemark.text || codemark.title}
									<br />
								</>
							);
						})}
					</pre>
				</div>
			</ScrollBox>
		</div>
	);
};
