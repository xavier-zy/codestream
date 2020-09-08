import { URI } from "vscode-uri";

"use strict";

export enum GitRemoteType {
	Fetch = "fetch",
	Push = "push"
}

export class GitRemote {
	readonly uri: URI;

	constructor(
		public readonly repoPath: string,
		public readonly name: string,
		url: string,
		public readonly scheme: string,
		public readonly domain: string,
		public readonly path: string,
		public readonly types: { type: GitRemoteType; url: string }[]
	) {
		this.uri = URI.parse(scheme ? url : `ssh://${url}`);
	}

	get normalizedUrl(): string {
		return `${this.domain}/${this.path}`.toLocaleLowerCase();
	}
}

export interface GitRemoteLike {
	domain: string;
}
