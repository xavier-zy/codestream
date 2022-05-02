import assert from "assert";
import * as fs from "fs";
import { CancellationToken } from "vscode-languageclient";
import { FileParser } from "./rubyFileParser";

describe("FileParser", function() {
	describe("symbolInformations", function() {
		it("should populate parent class for functions", function() {
			const content = fs.readFileSync("./test-projects/ruby/agents_controller.rb", {
				encoding: "utf8"
			});
			const subject = new FileParser(content, {} as CancellationToken, {});
			const result = subject.symbolInformations();
			console.info("result", JSON.stringify(result, null, 2));
			const showFunction = result.find(item => item.name === "show");
			assert.strictEqual(showFunction?.startLine, 16);
			assert.strictEqual(showFunction?.containerName, "AgentsController");

			const agentClass = result.find(item => item.type === "class");
			assert.strictEqual(agentClass?.name, "AgentsController");
			assert.strictEqual(agentClass?.startLine, 5);
			assert.strictEqual(agentClass?.endLine, 75);

			const editFunc = result.find(item => item.name === "edit");
			assert.strictEqual(editFunc?.startLine, 27);
			assert.strictEqual(editFunc?.endLine, 27);
		});
	});
});
