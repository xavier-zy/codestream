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

	/**
	 * Certain remote names are more important, and have more "weight" than others.
	 * This includes "origin" and "upstream". We prioritize these by assigning them a lower
	 * number. When sorting, these lower or negative numbers will naturally sort first
	 *
	 * @readonly
	 * @memberof GitRemote
	 */
	get remoteWeight() {
		const name = this.name.toLowerCase();
		return name === "upstream" ? -100 : name === "origin" ? 0 : 100;
	}

	get normalizedUrl(): string {
		return `${this.domain}/${this.path}`.toLocaleLowerCase();
	}
}

export interface GitRemoteLike {
	domain: string;
}
