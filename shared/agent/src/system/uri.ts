import { URI } from "vscode-uri";

export namespace Uris {
	export const CodeStreamDiffPrefix = "-0-";
	export const CodeStreamDiffSuffix = "-0-";

	export function toCodeStreamDiffUri(data: any, filePath: string): string {
		const encoded = Buffer.from(JSON.stringify(data)).toString("base64");
		return `codestream-diff://${CodeStreamDiffPrefix}/${encoded}/${CodeStreamDiffSuffix}/${filePath}`;
	}

	export function fromCodeStreamDiffUri<T>(uri: string): T | undefined {
		const uriObject = URI.parse(uri);
		const decoded = Buffer.from(
			uriObject.fsPath.substring(0, uriObject.fsPath.indexOf(CodeStreamDiffPrefix)),
			"base64"
		).toString("utf8") as any;
		return JSON.parse(decoded) as T;
	}

	export function isCodeStreamDiffUri(uri: string) {
		return uri && uri.indexOf(CodeStreamDiffPrefix) > -1;
	}
}
