"use strict";

import { Strings } from "../../system/string";
import { CSStackTraceInfo } from "../../protocol/api.protocol.models";

let regex: RegExp;

export function Parser(stack: string): CSStackTraceInfo {
	const info: CSStackTraceInfo = { lines: [] };

	if (!regex) {
		// NOTE: there's no great way to have a multiline regex in js (except for this hackery ;)
		// so we build it once
		regex = Strings.regexBuilder`
			^
			\s*
			at
			\s+
			((?:(?:[\d\w]*\.)*[\d\w]*))\. // package
			([\d\w\$]*)\. // class
			([\d\w\$]*) // method
			\(
				(?:(?:([\d\w]*\.java):(\d*)) // file:line
				|([\d\w\s]*)) // file
			\)
			$`;
	}

	let m;
	const split = stack.split("\n");
	const firstLine = split[0];
	const match = firstLine.match(/^.*?: (.*)$/);
	if (match && match[1]) {
		info.header = firstLine;
		info.error = match[1];
		split.shift();
		stack = split.join("\n");
	}

	while ((m = regex.exec(stack)) !== null) {
		// This is necessary to avoid infinite loops with zero-width matches
		if (m.index === regex.lastIndex) {
			regex.lastIndex++;
		}

		const [, packageName, className, methodName, file, lineText] = m;
		let lineNum: number | undefined = parseInt(lineText, 10);
		if (isNaN(lineNum)) lineNum = undefined;
		info.lines.push({
			method: `${packageName}.${className}.${methodName}`,
			fileFullPath: file,
			line: lineNum
		});
	}

	return info;
}
