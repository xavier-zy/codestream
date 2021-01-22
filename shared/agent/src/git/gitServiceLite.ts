"use strict";
import * as fs from "fs";
import { memoize } from "lodash-es";
import * as path from "path";
import { URI } from "vscode-uri";
import { Logger } from "../logger";
import { CodeStreamSession } from "../session";
import { Strings } from "../system";
import { git, isWslGit } from "./git";

const cygwinRegex = /\/cygdrive\/([a-zA-Z])/;
const wslUncRegex = /(\\\\wsl\$\\.+?)\\.*/;
const wslMntRegex = /\/mnt\/([a-z])(.+)/;
/**
 * Class to allow for some basic git operations that has no dependency on a user session
 *
 * @export
 * @class GitServiceLite
 */
export class GitServiceLite {
	private readonly _memoizedGetRepoRoot: (filePath: string) => Promise<string | undefined>;
	private readonly _memoizedGetKnownCommitHashes: (filePath: string) => Promise<string[]>;

	constructor(public readonly session: CodeStreamSession) {
		this._memoizedGetRepoRoot = memoize(this._getRepoRoot);
		this._memoizedGetKnownCommitHashes = memoize(this._getKnownCommitHashes);
	}

	getKnownCommitHashes(filePath: string): Promise<string[]> {
		return this._memoizedGetKnownCommitHashes(filePath);
	}

	async getRepoCommitHistory(repoUri: URI): Promise<string[]>;
	async getRepoCommitHistory(repoPath: string): Promise<string[]>;
	async getRepoCommitHistory(repoUriOrPath: URI | string): Promise<string[]> {
		const repoPath = typeof repoUriOrPath === "string" ? repoUriOrPath : repoUriOrPath.fsPath;

		let data;
		try {
			data = await git({ cwd: repoPath }, "rev-list", "--date-order", "master", "--");
		} catch {}
		if (!data) {
			try {
				data = await git({ cwd: repoPath }, "rev-list", "--date-order", "HEAD", "--");
			} catch {}
		}

		if (!data) return [];

		return data.trim().split("\n");
	}

	async getRepoBranchForkCommits(repoUri: URI): Promise<string[]>;
	async getRepoBranchForkCommits(repoPath: string): Promise<string[]>;
	async getRepoBranchForkCommits(repoUriOrPath: URI | string): Promise<string[]> {
		const repoPath = typeof repoUriOrPath === "string" ? repoUriOrPath : repoUriOrPath.fsPath;

		let data: string | undefined;
		try {
			data = await git({ cwd: repoPath }, "branch", "--");
		} catch {}
		if (!data) return [];

		const branches = data.trim().split("\n");
		const commits: string[] = [];
		await Promise.all(
			branches.map(async branch => {
				branch = branch.trim();
				if (branch.startsWith("*")) {
					branch = branch.split("*")[1].trim();
				}
				let result: string | undefined;
				try {
					result = await git({ cwd: repoPath }, "merge-base", "--fork-point", branch, "--");
				} catch {}
				if (result) {
					commits.push(result.split("\n")[0]);
				}
			})
		);

		return commits;
	}

	getRepoRoot(uri: URI): Promise<string | undefined>;
	getRepoRoot(path: string): Promise<string | undefined>;
	getRepoRoot(uriOrPath: URI | string): Promise<string | undefined> {
		const filePath = typeof uriOrPath === "string" ? uriOrPath : uriOrPath.fsPath;
		return this._memoizedGetRepoRoot(filePath);
	}

	private async _getKnownCommitHashes(filePath: string): Promise<string[]> {
		const commitHistory = await this.getRepoCommitHistory(filePath);
		const firstLastCommits =
			commitHistory.length > 10
				? [...commitHistory.slice(0, 5), ...commitHistory.slice(-5)]
				: commitHistory;
		const branchPoints = await this.getRepoBranchForkCommits(filePath);
		return [...firstLastCommits, ...branchPoints];
	}

	private async _getRepoRoot(filePath: string): Promise<string | undefined> {
		let cwd;
		if (fs.existsSync(filePath) && fs.lstatSync(filePath).isDirectory()) {
			cwd = filePath;
		} else {
			[cwd] = Strings.splitPath(filePath);

			if (!fs.existsSync(cwd)) {
				Logger.log(`getRepoRoot: ${cwd} doesn't exist. Returning undefined`);
				return undefined;
			}
		}

		const wslPrefix = isWslGit() ? this._getWslPrefix(filePath) : undefined;
		try {
			const data = (await git({ cwd: cwd }, "rev-parse", "--show-toplevel")).trim();
			const repoRoot = data === "" ? undefined : this._normalizePath(data, wslPrefix);

			if (repoRoot === undefined) {
				return undefined;
			}

			try {
				cwd = this._normalizePath(cwd);
				let relative = path.relative(repoRoot, cwd);
				let isParentOrSelf =
					!relative || (!relative.startsWith("..") && !path.isAbsolute(relative));
				if (isParentOrSelf) {
					Logger.log(`getRepoRoot: ${repoRoot} is parent of ${cwd} or itself - returning`);
					return repoRoot;
				}

				Logger.log(
					`getRepoRoot: ${repoRoot} is neither parent of ${cwd} nor itself - finding symlink`
				);
				const realCwd = this._normalizePath(fs.realpathSync(cwd));
				Logger.log(`getRepoRoot: ${cwd} -> ${realCwd}`);
				relative = path.relative(repoRoot, realCwd);
				isParentOrSelf = !relative || (!relative.startsWith("..") && !path.isAbsolute(relative));
				if (!isParentOrSelf) {
					Logger.log(
						`getRepoRoot: ${repoRoot} is neither parent of ${realCwd} nor itself - returning`
					);
					return repoRoot;
				}

				const symlinkRepoRoot = this._normalizePath(path.resolve(cwd, relative));
				Logger.log(
					`getRepoRoot: found symlink repo root ${symlinkRepoRoot} -> ${repoRoot} - returning`
				);

				return symlinkRepoRoot;
			} catch (ex) {
				Logger.warn(ex);
				return repoRoot;
			}
		} catch (ex) {
			// If we can't find the git executable, rethrow
			if (/spawn (.*)? ENOENT/.test(ex.message)) {
				throw ex;
			}

			return undefined;
		}
	}

	_getWslPrefix(path: string): string | undefined {
		const wslMatch = wslUncRegex.exec(path);
		if (wslMatch != null) {
			const [, prefix] = wslMatch;
			return prefix;
		}
		return undefined;
	}

	_normalizePath(path: string, wslPrefix: string | undefined = undefined): string {
		const cygwinMatch = cygwinRegex.exec(path);
		if (cygwinMatch != null) {
			const [, drive] = cygwinMatch;
			// c is just a placeholder to get the length, since drive letters are always 1 char
			let sanitized = `${drive}:${path.substr("/cygdrive/c".length)}`;
			sanitized = sanitized.replace(/\//g, "\\");
			Logger.debug(`Cygwin git path sanitized: ${path} -> ${sanitized}`);
			return sanitized;
		}

		if (wslPrefix) {
			// wsl git + wsl folder
			const normalized = wslPrefix + path.trim().replace(/\//g, "\\");
			Logger.debug(`WSL path normalized: ${path} -> ${normalized}`);
			return normalized;
		} else if (isWslGit()) {
			const wslMntMatch = wslMntRegex.exec(path);
			if (wslMntMatch != null) {
				// wsl git + windows folder perceived as /mnt/c/...
				const [, drive, rest] = wslMntMatch;
				const windowsPath = drive.toUpperCase() + ":" + rest;
				const normalized = Strings.normalizePath(windowsPath.trim());
				Logger.debug(`Windows path (with WSL git) normalized: ${path} -> ${normalized}`);
				return normalized;
			}
		}

		// Make sure to normalize: https://github.com/git-for-windows/git/issues/2478
		return Strings.normalizePath(path.trim());
	}
}
