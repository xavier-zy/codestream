import * as assert from "assert";
import * as vscode from "vscode";
import * as p from "path";
import { SymbolLocator } from "../../providers/symbolLocator";
import { CancellationTokenSource } from "vscode-languageclient";

suite("SymbolLocator Test Suite", () => {
	test("python codeLens test", async () => {
		return new Promise(async resolve => {
			// we require this extension
			await vscode.commands.executeCommand(
				"workbench.extensions.installExtension",
				"ms-python.python"
			);

			const uri = vscode.Uri.parse(
				p.join(vscode.workspace.workspaceFolders![0].uri.toString(), `app.py`)
			);

			const document = await vscode.workspace.openTextDocument(uri);

			const result = await new SymbolLocator().locate(
				document,
				new CancellationTokenSource().token
			);

			assert.strictEqual(result.length, 9);
			resolve();
		});
	}).timeout(45000);
});
