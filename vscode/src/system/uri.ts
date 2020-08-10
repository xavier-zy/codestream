import { Uri } from "vscode";
import { CodeStreamDiffUriData } from "@codestream/protocols/agent";

export namespace Uris {
	export const CodeStreamDiffPrefix = "-0-";
	export const CodeStreamDiffSuffix = "-0-";

	export function toCodeStreamDiffUri(data: CodeStreamDiffUriData, filePath: string): Uri {
		const encoded = Buffer.from(JSON.stringify(data)).toString("base64");
		return Uri.parse(
			`codestream-diff://${CodeStreamDiffPrefix}/${encoded}/${CodeStreamDiffSuffix}/${filePath}`
		);
	}

	export function fromCodeStreamDiffUri<T>(uri: string): T | undefined {
		const uriObject = Uri.parse(uri);
		const decoded = Buffer.from(
			uriObject.fsPath.substring(0, uriObject.fsPath.indexOf("-0-")),
			"base64"
		).toString("utf8") as any;
		return JSON.parse(decoded) as T;
	}

	export function isCodeStreamDiffUri(uri: string) {
		return uri && uri.indexOf(CodeStreamDiffPrefix) > -1;
	}
}
