"use strict";

import { CSStackTraceInfo } from "../../protocol/api.protocol.models";

export function Parser(stack: string): CSStackTraceInfo {
	const regex = new RegExp(
		"^\\tat ((?:(?:[\\d\\w]*\\.)*[\\d\\w]*))\\.([\\d\\w\\$]*)\\.([\\d\\w\\$]*)\\((?:(?:([\\d\\w]*\\.java):(\\d*))|([\\d\\w\\s]*))\\)$"
	);
	const lines = stack.split("\n");
	const stackInfo: CSStackTraceInfo = { text: stack, lines: [] };
	stackInfo.header = lines[0];
	const len = lines.length;
	for (let i = 1; i < len; i++) {
		const line = lines[i];
		const match = line.match(regex);
		if (match) {
			const [packageName, className, methodName, file, lineText] = match;
			let lineNum: number | undefined = parseInt(lineText, 10);
			if (isNaN(lineNum)) lineNum = undefined;
			stackInfo.lines.push({
				method: `${packageName}.${className}.${methodName}`,
				fileFullPath: file,
				line: lineNum
			});
		} else {
			stackInfo.lines.push({ error: "could not parse line" });
		}
	}

	return stackInfo;
}
