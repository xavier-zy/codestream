import { Logger } from "../logger";

export namespace Uris {
	export const CodeStreamDiffPrefix = "-0-";
	export const CodeStreamDiffSuffix = "-0-";

	export function toCodeStreamDiffUri(data: any, filePath: string): string {
		const encoded = Buffer.from(JSON.stringify(data)).toString("base64");
		return `codestream-diff://${CodeStreamDiffPrefix}/${encoded}/${CodeStreamDiffSuffix}/${filePath}`;
	}

	export function fromCodeStreamDiffUri<T>(uri: string): T | undefined {
		try {
			const match = uri.match(
				`codestream-diff://${CodeStreamDiffPrefix}/(.+)/${CodeStreamDiffSuffix}/`
			);
			if (!match) return undefined;
			const decoded = Buffer.from(decodeURIComponent(match[1]), "base64").toString("utf8") as any;
			return JSON.parse(decoded) as T;
		} catch (ex) {
			Logger.warn(ex);
			return undefined;
		}
	}

	export function isCodeStreamDiffUri(uri: string) {
		return uri && uri.indexOf(CodeStreamDiffPrefix) > -1;
	}
}
