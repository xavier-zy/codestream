"use strict";

import { structuredPatch } from "diff";
import * as fs from "fs";
import path from "path";
import { Container, SessionContainer } from "../container";
import { Logger } from "../logger";
import { calculateLocation, MAX_RANGE_VALUE } from "../markerLocation/calculator";
import {
    ResolveStackTraceLineRequest,
    ResolveStackTraceLineRequestType,
    ResolveStackTraceLineResponse
} from "../protocol/agent.protocol";
import { CodeStreamSession } from "../session";
import { log } from "../system/decorators/log";
import { lsp, lspHandler } from "../system/decorators/lsp";
import { Strings } from "../system/string";
import { xfs } from "../xfs";

@lsp
export class NRManager {

    constructor(readonly session: CodeStreamSession) { }

    @log()
    @lspHandler(ResolveStackTraceLineRequestType)
    async resolveStackTraceLine({ rawLine, repoRemote, sha }: ResolveStackTraceLineRequest): Promise<ResolveStackTraceLineResponse> {
        // …v/sandboxes/csbe/codestream-server/api_server/modules/codemarks/codemark_creator.js:21:9
        const [ pathSuffix, line, column ] = rawLine.split(":");
        const { documents } = Container.instance();
        const { git, repos } = SessionContainer.instance();
        const gitRepos = await git.getRepositories();
        let matchingRepo = undefined;

        for (const gitRepo of gitRepos) {
            const remotes = await git.getRepoRemotes(gitRepo.path);
            for (const remote of remotes) {
                if (remote.uri.toString().toLowerCase() === repoRemote.toLowerCase()) {
                    matchingRepo = gitRepo;
                    break;
                }
            }
        }

        if (!matchingRepo) return { error: `Unable to find repo with remote ${repoRemote}` };

        const allFilePaths = this.getAllFiles(matchingRepo.path);
        const pathSuffixParts = pathSuffix.split("/").slice().reverse();
        let bestMatchingFilePath = undefined;
        let bestMatchingScore = 0;

        for (const filePath of allFilePaths) {
            const filePathParts = filePath.split("/").slice().reverse();

            for (let i = 0; i < pathSuffixParts.length; i++) {
                if (pathSuffixParts[i] !== filePathParts[i]) {
                     if (i > bestMatchingScore) {
                         bestMatchingScore = i;
                         bestMatchingFilePath = filePath;
                     }
                     break;
                }
            }
        }

        if (!bestMatchingFilePath) return { error: `Unable to find matching file for path suffix ${pathSuffix}` };

        const diffToHead = await git.getDiffBetweenCommits(
            sha,
            "HEAD",
            bestMatchingFilePath,
            true
        );

        if (!diffToHead) return { error: `Unable to calculated diff from ${sha} to HEAD`}

        const currentCommitLocation = await calculateLocation({
            id: "nrError",
            lineStart: parseInt(line),
            colStart: parseInt(column),
            lineEnd: parseInt(line),
            colEnd: MAX_RANGE_VALUE
        }, diffToHead);

        const currentCommitText = await git.getFileContentForRevision(bestMatchingFilePath, "HEAD");
        if (!currentCommitText) return { error: `Unable to read current HEAD contents of ${bestMatchingFilePath}` };

        const doc = documents.get("file://" + bestMatchingFilePath);
        let currentBufferText = doc && doc.getText();
        if (currentBufferText == null) {
            currentBufferText = await xfs.readText(bestMatchingFilePath);
        }
        if (!currentBufferText) return { error: `Unable to read current buffer contents of ${bestMatchingFilePath}` };

        const diffToCurrentContents = structuredPatch(
            bestMatchingFilePath,
            bestMatchingFilePath,
            Strings.normalizeFileContents(currentCommitText),
            Strings.normalizeFileContents(currentBufferText),
            "",
            ""
        );

        const currentBufferLocation = await calculateLocation(
            currentCommitLocation, diffToCurrentContents
        );

        return {
            repoId: matchingRepo.id,
            fileFullPath: bestMatchingFilePath,
            fileRelativePath: path.relative(matchingRepo.path, bestMatchingFilePath),
            line: currentBufferLocation.lineStart,
            column: currentBufferLocation.colStart
        };
    }

    private getAllFiles(dirPath: string, arrayOfFiles?: string[] | undefined): string[] {
        arrayOfFiles = arrayOfFiles || [];
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
            const filePath = path.join(dirPath, file);
            if (fs.statSync(filePath).isDirectory()) {
                arrayOfFiles = this.getAllFiles(filePath, arrayOfFiles);
            } else {
                arrayOfFiles!.push(filePath);
            }
        }

        return arrayOfFiles;
    }

}