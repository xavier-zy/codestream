"use strict";

import { CSStackTraceInfo } from "../../protocol/api.protocol.models";

export function Parser(stack: string): CSStackTraceInfo {
	const regex = new RegExp(
		"^in (?:([\\d\\w\\\\]+)::)?([\\d\\w\\\\\\{\\}]+) called at (\\?|(?:[\\d\\w\\/]+\\.php)) \\((\\?|[\\d]*)\\)$"
	);
	const lines = stack.trim().split("\n");
	const stackInfo: CSStackTraceInfo = { lines: [] };
	const len = lines.length;
	for (let i = 0; i < len; i++) {
		const line = lines[i].trim();
		const match = line.match(regex);
		if (match) {
			const [, className, methodName, file, lineText] = match;
			let lineNum: number | undefined = parseInt(lineText, 10);
			if (isNaN(lineNum)) lineNum = undefined;
			stackInfo.lines.push({
				method: className ? `${className}::${methodName}` : methodName,
				fileFullPath: file,
				line: lineNum
			});
		} else {
			stackInfo.lines.push({ error: "could not parse line" });
		}
	}

	return stackInfo;
}
