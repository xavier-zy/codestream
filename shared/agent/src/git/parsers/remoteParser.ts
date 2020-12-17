"use strict";
import { GitRemote, GitRemoteType } from "../models/remote";
import * as childProcess from "child_process";
import { Logger } from "../../logger";

const emptyStr = "";

const remoteRegex = /^(.*)\t(.*)\s\((.*)\)$/gm;
const urlRegex = /^(?:(git:\/\/)(.*?)(?::.*?)?\/|(https?:\/\/)(?:.*?@)?(.*?)(?::.*?)?\/|git@(.*):|(ssh:\/\/)(?:.*@)?(.*?)(?::.*?)?(?:\/|(?=~))|(?:.*?@)(.*?):)(.*)$/;
const hostnameRegex = new RegExp("hostname (.*)");
export class GitRemoteParser {
	static async parse(data: string, repoPath: string): Promise<GitRemote[]> {
		if (!data) return [];

		const remotes: GitRemote[] = [];
		const groups = Object.create(null);

		let url: string;
		let scheme: string;
		let domain: string;
		let path: string;
		let uniqueness: string;
		let remote: GitRemote | undefined;
		let match: RegExpExecArray | null = null;
		do {
			match = remoteRegex.exec(data);
			if (match == null) break;

			// Stops excessive memory usage -- https://bugs.chromium.org/p/v8/issues/detail?id=2869
			url = ` ${match[2]}`.substr(1);

			[scheme, domain, path] = await this.parseGitUrl(url);

			uniqueness = `${domain}/${path}`;
			remote = groups[uniqueness];
			if (remote === undefined) {
				remote = new GitRemote(
					repoPath,
					// Stops excessive memory usage -- https://bugs.chromium.org/p/v8/issues/detail?id=2869
					` ${match[1]}`.substr(1),
					url,
					scheme,
					domain,
					path,
					// Stops excessive memory usage -- https://bugs.chromium.org/p/v8/issues/detail?id=2869
					[{ url: url, type: ` ${match[3]}`.substr(1) as GitRemoteType }]
				);
				remotes.push(remote);
				groups[uniqueness] = remote;
			} else {
				// Stops excessive memory usage -- https://bugs.chromium.org/p/v8/issues/detail?id=2869
				remote.types.push({ url: url, type: ` ${match[3]}`.substr(1) as GitRemoteType });
			}
		} while (match != null);

		if (!remotes.length) return [];

		return remotes;
	}

	private static matchToTuple(match: any, host: string): [string, string, string] {
		return [
			match[1] || match[3] || match[6],
			match[2] || match[4] || host || match[7] || match[8],
			match[9].replace(/\.git\/?$/, emptyStr)
		];
	}

	static async parseGitUrl(url: string): Promise<[string, string, string]> {
		const match = urlRegex.exec(url);
		if (match == null) return [emptyStr, emptyStr, emptyStr];

		let host = match[5];

		// if this isn't ssh, just return normal, if it is, use the ssh alias finder below
		if (url.indexOf("git@") === -1) return GitRemoteParser.matchToTuple(match, host);

		return new Promise(resolve => {
			try {
				// if this is an ssh setup, it's possible that a user has an alias setup.
				// we can get the alias for this by running the `ssh -G <remoteAlias>`` command
				// and parsing to get the `hostname` value
				// if, for some reason this fails, fall back to doing the old (current) logic
				childProcess.execFile("ssh", ["-G", host], function(err: any, stdout: any, stderr: any) {
					try {
						if (err || stderr) {
							Logger.warn(`remoteParser: parseGitUrl err=${err} stderr=${stderr}`);
							resolve(GitRemoteParser.matchToTuple(match, host));
						} else {
							const hostnameMatch = hostnameRegex.exec(stdout);
							if (hostnameMatch && hostnameMatch[1]) {
								host = hostnameMatch[1];
							}

							resolve(GitRemoteParser.matchToTuple(match, host));
						}
					} catch (ex) {
						Logger.warn(`remoteParser: parseGitUrl ex=${ex}`);
						resolve(GitRemoteParser.matchToTuple(match, host));
					}
				});
			} catch (ex) {
				Logger.warn(`remoteParser: parseGitUrl execFile ex=${ex}`);
				resolve(GitRemoteParser.matchToTuple(match, host));
			}
		});
	}
}
