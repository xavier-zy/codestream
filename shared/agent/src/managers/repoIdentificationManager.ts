"use strict";

import { promises as fsPromises } from "fs";
import path from "path";
import { CodeStreamSession } from "../session";
import { lsp } from "../system/decorators/lsp";
import { ReposScm, RepoProjectType } from "../protocol/agent.protocol";

@lsp
export class RepoIdentificationManager {
	constructor(readonly session: CodeStreamSession) {}

	async identifyRepo(repo: ReposScm): Promise<RepoProjectType> {
		const files = await fsPromises.readdir(repo.path);
		if (await this.repoIsNodeJS(repo, files)) {
			return RepoProjectType.NodeJS;
		} else if (await this.repoIsJava(repo, files)) {
			return RepoProjectType.Java;
		} else {
			return RepoProjectType.Unknown;
		}
	}

	private async repoIsNodeJS(repo: ReposScm, files: string[]): Promise<boolean> {
		for (let file of files) {
			const filePath = path.join(repo.path, file);
			const isDir = (await fsPromises.stat(filePath)).isDirectory();
			if ((isDir && file === "node_modules") || (!isDir && file === "package.json")) return true;
		}
		return false;
	}

	private async repoIsJava(repo: ReposScm, files: string[]): Promise<boolean> {
		return await this._findFileWithExtension(repo.path, ".java", files, 2, 0);
	}

	private async _findFileWithExtension(
		basePath: string,
		extension: string,
		files: string[],
		maxDepth: number,
		depth: number
	): Promise<boolean> {
		for (let file of files) {
			const filePath = path.join(basePath, file);
			const isDir = (await fsPromises.stat(filePath)).isDirectory();
			if (isDir) {
				if (depth < maxDepth) {
					const dirPath = path.join(basePath, file);
					const subFiles = await fsPromises.readdir(dirPath);
					if (
						await this._findFileWithExtension(dirPath, extension, subFiles, maxDepth, depth + 1)
					) {
						return true;
					}
				}
			} else if (path.extname(filePath) === extension) {
				return true;
			}
		}
		return false;
	}
}
