"use strict";

import { CSStackTraceInfo } from "../../protocol/api.protocol.models";
import * as StackTraceParser from "stacktrace-parser";

export function Parser(stack: string): CSStackTraceInfo {
	const info: CSStackTraceInfo = { lines: [] };
	const firstLine = stack.split("\n")[0];
	const match = firstLine.match(/Error:(.*)$/);
	if (match && match[1]) {
		info.header = firstLine;
		info.error = match[1];
	}

	/*
	The code below works great! If we can actually manage to get a full stack trace.
	Unfortunately, until NR can deliver a real Open In IDE button passing us the real stack trace,
	we are limited to the truncated stack trace we can glean from the web page, so we have to
	go with our own parser garbage...
	*/
	/*
	const parsed = StackTraceParser.parse(stack);
	info.lines = parsed.map(line => {
		return {
			fileFullPath: line.file ? line.file : undefined,
			method: line.methodName,
			arguments: line.arguments,
			line: line.lineNumber === null ? undefined : line.lineNumber,
			column: line.column === null ? undefined : line.column
		};
	});
	*/

	const lines = stack.split("\n");
	info.lines = lines.map(line => {
		const parts = line.split(":");
		if (parts.length > 2) {
			return {
				fileFullPath: parts[0],
				line: parseInt(parts[1], 10),
				column: parseInt(parts[2], 0)
			};
		} else {
			return {
				error: "unable to parse line"
			};
		}
	});
	return info;
}
