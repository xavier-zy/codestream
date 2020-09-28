import { expect } from "chai";
import { describe, it } from "mocha";
import { GitHubProvider } from "../../../src/providers/github";

const repos = {
	repos: [
		{
			id: "1234",
			name: "bar",
			remotes: [
				{
					url: "github.com/bcanzanella/bar.com",
					normalizedUrl: "github.com/bcanzanella/bar.com",
					companyIdentifier: "github.com/bcanzanella"
				}
			],
			teamId: "123",
			createdAt: new Date().getTime(),
			creatorId: "foobar123",
			modifiedAt: new Date().getTime()
		}
	]
};

const repos2 = {
	repos: [
		{
			id: "1234",
			name: "bar",
			remotes: [
				{
					url: "github.com/bcanzanella/bar.com",
					normalizedUrl: "github.com/bcanzanella/bar.com",
					companyIdentifier: "github.com/bcanzanella"
				},
				{
					url: "github.com/bcanzanella/bar.com",
					normalizedUrl: "github.com/bcanzanella/bar.com",
					companyIdentifier: "github.com/bcanzanella"
				}
			],
			teamId: "123",
			createdAt: new Date().getTime(),
			creatorId: "foobar123",
			modifiedAt: new Date().getTime()
		},
		{
			id: "1234",
			name: "bar.com",
			remotes: [
				{
					url: "github.com/bcanzanella/bar.com",
					normalizedUrl: "github.com/bcanzanella/bar.com",
					companyIdentifier: "github.com/bcanzanella"
				},
				{
					url: "github.com/bcanzanella/bar.com",
					normalizedUrl: "github.com/bcanzanella/bar.com",
					companyIdentifier: "github.com/bcanzanella"
				}
			],
			teamId: "123",
			createdAt: new Date().getTime(),
			creatorId: "foobar123",
			modifiedAt: new Date().getTime()
		}
	]
};

describe("github.ts", () => {
	describe("getPullRequestRepo", () => {
		it("can match on a remote", async function() {
			const foo = new GitHubProvider(undefined!, {
				id: "github*com",
				name: "github",
				host: "test.com"
			});
			const result = await foo.getPullRequestRepo(repos, {
				repository: {
					name: "bar.com",
					nameWithOwner: "bcanzanella/bar.com",
					url: "https://github.com/bcanzanella/bar.com"
				}
			} as any);
			expect(result!.id).to.equal("1234");
		});

		it("can match on a name", async function() {
			const foo = new GitHubProvider(undefined!, {
				id: "github*com",
				name: "github",
				host: "test.com"
			});
			const result = await foo.getPullRequestRepo(repos2, {
				repository: {
					name: "bar.com",
					nameWithOwner: "bcanzanella/bar.com",
					url: "https://github.com/bcanzanella/bar.com"
				}
			} as any);
			expect(result!.id).to.equal("1234");
		});
	});
});
