import { Strings } from "system";
import {
	Disposable,
	TextDocumentContentProvider,
	Uri,
	workspace
} from "vscode";

import { Container } from "../container";

export class GitContentProvider implements TextDocumentContentProvider, Disposable {
	private readonly _disposable: Disposable;

	constructor() {
		this._disposable = Disposable.from(
			workspace.registerTextDocumentContentProvider("codestream-git", this)
		);
	}

	async provideTextDocumentContent(uri: Uri): Promise<string> {
		const { path, sha } = Strings.parseGitUrl(uri);
		const contents = await Container.agent.scm.getFileContentsAtRevision(undefined, path, sha);
		return contents.content || "";
	}

	dispose() {
		this._disposable.dispose();
	}
}

export function toCSGitUri(uri: Uri, sha: string): Uri {
	return uri.with({
		scheme: "codestream-git",
		query: JSON.stringify({
			sha: sha,
			shortSha: sha.substr(0, 7)
		})
	});
}
