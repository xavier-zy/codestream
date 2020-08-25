import React from "react";
import * as Path from "path-browserify";
import { prettyPrintOne } from "code-prettify";
import { escapeHtml } from "../utils";
import styled from "styled-components";

const Root = styled.div`
	font-size: 12px;
	overflow-x: auto;
	font-family: Menlo, Consolas, "DejaVu Sans Mono", monospace;
	white-space: pre;
	pre {
		white-space: pre !important;
		margin: 0;
	}
	> div {
		display: flex;
		background-origin: content-box;
		padding: 3px 10px;
		> span.linenum {
			opacity: 0.5;
		}
		margin: 0;
	}
	.added {
		// background: #e6ffed;
		background: rgba(80, 255, 0, 0.1);
	}
	.deleted {
		// background: #ffeef0;
		background: rgba(255, 0, 0, 0.12);
	}
	.header {
		background: rgba(0, 150, 255, 0.1);
	}
`;

export const PullRequestPatch = (props: {
	patch: string;
	filename: string;
	className?: string;
}) => {
	const { patch, filename } = props;
	if (!patch) return null;
	let leftLine: number;
	let rightLine: number;
	let width;

	let extension = Path.extname(filename).toLowerCase();
	if (extension.startsWith(".")) {
		extension = extension.substring(1);
	}

	const renderLineNum = line => (
		<span className="linenum">{(line + "").padStart(width, " ") + "  "}</span>
	);

	const syntaxHighlight = string => {
		// put a space to the right of the + or - sign
		const string2 = string.slice(0, 1) + " " + string.slice(1);
		const html = prettyPrintOne(escapeHtml(string2), extension);
		return <pre className="prettyprint" dangerouslySetInnerHTML={{ __html: html }} />;
	};

	return (
		<Root className={props.className + " pr-patch"}>
			{patch.split("\n").map(_ => {
				if (_ === "\\ No newline at end of file") return null;
				if (_.indexOf("@@ ") === 0) {
					const matches = _.match(/@@ \-(\d+).*? \+(\d+)/);
					if (matches) {
						leftLine = parseInt(matches[1], 10) - 1;
						rightLine = parseInt(matches[2]) - 1;
						width = Math.max(4, rightLine.toString().length + 1);
					}
					return (
						<div className="header">
							{renderLineNum("")}
							{renderLineNum("")}
							<pre className="prettyprint">{_}</pre>
						</div>
					);
				} else if (_.indexOf("+") === 0) {
					rightLine++;
					return (
						<div className="added">
							{renderLineNum("")}
							{renderLineNum(rightLine)}
							{syntaxHighlight(_)}
						</div>
					);
				} else if (_.indexOf("-") === 0) {
					leftLine++;
					return (
						<div className="deleted">
							{renderLineNum(leftLine)}
							{renderLineNum("")}
							{syntaxHighlight(_)}
						</div>
					);
				} else {
					leftLine++;
					rightLine++;
					return (
						<div>
							{renderLineNum(leftLine)}
							{renderLineNum(rightLine)}
							{syntaxHighlight(_)}
						</div>
					);
				}
			})}
		</Root>
	);
};
