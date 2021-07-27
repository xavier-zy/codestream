"use strict";

import * as fs from "fs";
import path from "path";
import { CodeStreamSession } from "../session";
import { lsp, lspHandler } from "../system/decorators/lsp";
import { ReposScm, RepoProjectType } from "../protocol/agent.protocol";

@lsp
export class RepoIdentificationManager {
	constructor(readonly session: CodeStreamSession) {}

	identifyRepo(repo: ReposScm): RepoProjectType {
		if (this.repoIsNodeJS(repo)) {
			return RepoProjectType.NodeJS;
		} else {
			return RepoProjectType.Unknown;
		}
	}

	private repoIsNodeJS(repo: ReposScm): boolean {
		console.warn("COLIN: READING FROM REPO PATH:", repo.path);
		const files = fs.readdirSync(repo.path);
		console.warn("COLIN: files:", files);
		return !!files.find(file => {
			const filePath = path.join(repo.path, file);
			const isDir = fs.statSync(filePath).isDirectory();
			return (isDir && file === "node_modules") || (!isDir && file === "package.json");
		});
	}
}
