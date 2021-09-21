import { expect } from "chai";
require("mocha").describe;
require("mocha").it;
import { uniq } from "lodash-es";
import { Strings } from "../../../src/system/string";

describe("strings.ts", () => {
	describe("normalizePath", () => {
		it("can normalize a variety of OS-specific paths (windows)", async function() {
			const unique = uniq(
				[
					"c:/foo/bar",
					"c:/foo/bar/",
					// this can only be run on windows
					// "C:/foo/bar",
					"c:\\foo\\bar",
					"c:\\foo\\bar\\"
					// this can only be run on windows
					// "C:\\foo\\bar\\"
				].map(_ => Strings.normalizePath(_))
			);
			expect(unique.length).to.eq(1);
			expect(unique[0]).to.equal("c:/foo/bar");
		});

		it("can normalize a variety of OS-specific paths (mac/linux)", async function() {
			const unique = uniq(
				["/users/foo/bar", "/users/foo/bar/", "\\users\\foo\\bar", "\\users\\foo\\bar\\"].map(_ =>
					Strings.normalizePath(_)
				)
			);
			expect(unique.length).to.eq(1);
			expect(unique[0]).to.equal("/users/foo/bar");
		});
	});

	describe("trimEnd", () => {
		it("has a trailing slash", () => {
			expect(Strings.trimEnd("https://codestream.com/", "/")).to.equal("https://codestream.com");
		});

		it("has a trailing ?", () => {
			expect(Strings.trimEnd("https://codestream.com/?", "?")).to.equal("https://codestream.com/");
		});
	});
});
