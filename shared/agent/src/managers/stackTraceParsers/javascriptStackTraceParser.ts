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
	return info;
}
