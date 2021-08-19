"use strict";

import { promises as fsPromises, readFileSync as fsReadFileSync } from "fs";
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
		} else if (await this.repoIsDotNetCore(repo, files)) {
			return RepoProjectType.DotNetCore;
		} else if (await this.repoIsDotNetFramework(repo, files)) {
			return RepoProjectType.DotNetFramework;
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

	private async repoIsDotNetCore(repo: ReposScm, files: string[]): Promise<boolean> {
		const projectFileName = files.find(file =>
			file.endsWith(".csproj" || file.endsWith(".vbproj"))
		);

		if (projectFileName) {
			const contents = fsReadFileSync(path.join(repo.path, projectFileName), "utf8");
			return (
				contents != null &&
				new RegExp(/\<TargetFramework\>net[0-9]+\.[0-9]+\<\/TargetFramework\>/, "gm").test(contents)
			);
		}

		return false;
	}

	private async repoIsDotNetFramework(repo: ReposScm, files: string[]): Promise<boolean> {
		const projectFileName = files.find(file =>
			file.endsWith(".csproj" || file.endsWith(".vbproj"))
		);

		if (projectFileName) {
			const contents = fsReadFileSync(path.join(repo.path, projectFileName), "utf8");
			return (
				contents != null &&
				new RegExp(/\<TargetFrameworkVersion\>v(.+)+\<\/TargetFrameworkVersion\>/, "gm").test(
					contents
				)
			);
		}

		return false;
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
