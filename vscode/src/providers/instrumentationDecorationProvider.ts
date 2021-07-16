"use strict";

import * as fs from "fs";
import {
	CancellationToken,
	ConfigurationChangeEvent,
	Disposable,
	Hover,
	HoverProvider,
	Position,
	TextDocument,
	TextEditor,
	TextEditorDecorationType,
	window
} from "vscode";
import * as vscode from "vscode";
import { CodeStreamDiffUriData } from "@codestream/protocols/agent";
import { SessionStatus, SessionStatusChangedEvent } from "../api/session";
import { Functions, Strings } from "../system";
import { configuration } from "../configuration";
import * as csUri from "../system/uri";

// import { BuiltInCommands } from "../constants";
import { Container } from "../container";

// const emptyArray = (Object.freeze([]) as any) as any[];

// TODO need cache for TextDocument to glyphs

const positionStyleMap: { [key: string]: string } = {
	inline: "display: inline-block; margin: 0 0.5em 0 0; vertical-align: middle;",
	overlay:
		"display: inline-block; left: 0; position: absolute; top: 50%; transform: translateY(-50%)"
};

const buildDecoration = (position: string) => {
	const pngPath = Container.context.asAbsolutePath("assets/images/eye.png");
	try {
		const pngBase64 = fs.readFileSync(pngPath, { encoding: "base64" });
		const pngInlineUrl = `data:image/png;base64,${pngBase64}`;

		return {
			contentText: "",
			height: "16px",
			width: "16px",

			textDecoration: `none; background-image: url(${pngInlineUrl}); background-position: center; background-repeat: no-repeat; background-size: contain; ${positionStyleMap[position]}`
		};
	} catch (e) {
		return;
	}
};

const MarkerPositions = ["inline", "overlay"];
const MarkerTypes = ["comment"];
const MarkerColors = ["blue", "green", "yellow", "orange", "red", "purple", "aqua", "gray"];

export class InstrumentationDecorationProvider implements HoverProvider, vscode.Disposable {
	private readonly _disposable: Disposable;
	private regex: RegExp;
	private _decorationTypes: { [key: string]: TextEditorDecorationType } | undefined;
	private _enabledDisposable: Disposable | undefined;
	private _suspended = false;
	private _watchedEditorsMap: Map<string, () => void> | undefined;

	// TODO fix me
	private _current: any[] = [];

	constructor() {
		this._disposable = Disposable.from(
			configuration.onDidChange(this.onConfigurationChanged, this),
			Container.session.onDidChangeSessionStatus(this.onSessionStatusChanged, this)
		);

		this.regex = /NewRelic\.([a-zA-Z_]+)\((["'][\w\-\_]+["'])/g;
		const decorationTypes: { [key: string]: TextEditorDecorationType } = Object.create(null);

		// window.onDidChangeVisibleTextEditors(this.onEditorVisibilityChanged, this);

		// vscode.workspace.onDidCloseTextDocument((e: TextDocument) => {
		// 	if (this._current.length) {
		// 		console.log(e);
		// 		this._current.forEach(_ => _.val.dispose());
		// 	}
		// });
		// vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
		// 	const editor = window.activeTextEditor;
		// 	if (!editor) return;
		// 	f(e.document);
		// });

		for (const position of MarkerPositions) {
			for (const type of MarkerTypes) {
				for (const color of MarkerColors) {
					const key = `${position}-${type}-${color}`;
					const before = buildDecoration(position);
					if (before) {
						decorationTypes[key] = window.createTextEditorDecorationType({
							before
						});
					}
				}
			}
		}
		this._decorationTypes = decorationTypes;
	}

	dispose() {
		this.disable();
		this._disposable && this._disposable.dispose();
	}

	private onConfigurationChanged(e: ConfigurationChangeEvent) {
		if (configuration.changed(e, configuration.name("showInstrumentationGlyphs").value)) {
			this.ensure(true);
		}
	}

	private onSessionStatusChanged(e: SessionStatusChangedEvent) {
		switch (e.getStatus()) {
			case SessionStatus.SignedOut:
				this.disable();
				break;

			case SessionStatus.SignedIn: {
				this.ensure();
				break;
			}
		}
	}

	private ensure(reset: boolean = false) {
		if (!Container.config.showMarkerGlyphs || !Container.session.signedIn) {
			this.disable();

			return;
		}

		if (reset) {
			this.disable();
		}
		this.enable();
	}

	private disable() {
		if (this._enabledDisposable === undefined) return;

		for (const editor of this.getApplicableVisibleEditors()) {
			this.clear(editor);
		}

		this._enabledDisposable.dispose();
		this._enabledDisposable = undefined;
	}

	private enable() {
		if (
			this._enabledDisposable !== undefined ||
			Container.session.status !== SessionStatus.SignedIn
		) {
			return;
		}

		const decorationTypes: { [key: string]: TextEditorDecorationType } = Object.create(null);

		if (!this._suspended) {
			for (const position of MarkerPositions) {
				for (const type of MarkerTypes) {
					for (const color of MarkerColors) {
						const key = `${position}-${type}-${color}`;
						const before = buildDecoration(position);
						if (before) {
							decorationTypes[key] = window.createTextEditorDecorationType({
								before
							});
						}
					}
				}
			}
		}

		//	for (const color of MarkerColors) {
		// decorationTypes[`overviewRuler-${color}`] = window.createTextEditorDecorationType({
		// 	overviewRulerColor: MarkerOverviewRuler[color],
		// 	overviewRulerLane: OverviewRulerLane.Center
		// });
		// decorationTypes[`trap-highlight-${color}`] = window.createTextEditorDecorationType({
		// 	rangeBehavior: DecorationRangeBehavior.OpenOpen,
		// 	isWholeLine: true,
		// 	backgroundColor: MarkerHighlights[color]
		// });
		// }

		this._decorationTypes = decorationTypes;

		const subscriptions: Disposable[] = [
			...Object.values(decorationTypes),
			Container.session.onDidChangeSessionStatus(this.onSessionStatusChanged, this),
			window.onDidChangeVisibleTextEditors(this.onEditorVisibilityChanged, this),
			vscode.workspace.onDidCloseTextDocument(this.onDocumentClosed, this),
			vscode.workspace.onDidSaveTextDocument((e: TextDocument) => {
				this.f(e);
			})
		];

		if (!this._suspended) {
			subscriptions.push(vscode.languages.registerHoverProvider({ scheme: "file" }, this));
			subscriptions.push(
				vscode.languages.registerHoverProvider({ scheme: "codestream-diff" }, this)
			);
		}

		this._enabledDisposable = Disposable.from(...subscriptions);

		this.applyToApplicableVisibleEditors();
	}

	applyToApplicableVisibleEditors(editors = window.visibleTextEditors) {
		const editorsToWatch = new Map<string, () => void>();

		for (const e of this.getApplicableVisibleEditors(editors)) {
			const key = e.document.uri.toString();
			editorsToWatch.set(
				key,
				(this._watchedEditorsMap && this._watchedEditorsMap.get(key)) ||
					Functions.debounce(() => this.apply(e, true), 1000)
			);

			this.apply(e);
		}

		this._watchedEditorsMap = editorsToWatch;
	}

	private getApplicableVisibleEditors(editors = window.visibleTextEditors) {
		return editors.filter(this.isApplicableEditor);
	}

	private isApplicableEditor(editor: TextEditor | undefined) {
		if (!editor || !editor.document) return false;

		if (editor.document.uri.scheme === "file") return true;

		// check for review diff
		const parsedUri = Strings.parseCSReviewDiffUrl(editor.document.uri.toString());
		if (parsedUri) {
			return parsedUri.version === "right";
		}

		// check for PR diff
		const codeStreamDiff = csUri.Uris.fromCodeStreamDiffUri<CodeStreamDiffUriData>(
			editor.document.uri.toString()
		);
		if (codeStreamDiff) {
			return codeStreamDiff.side === "right";
		}

		return false;
	}

	private async onDocumentClosed(e: TextDocument) {
		if (this._current.length) {
			console.log(e);
			this._current.forEach(_ => _.val.dispose());
		}
	}

	async apply(editor: TextEditor | undefined, force: boolean = false) {
		if (
			this._decorationTypes === undefined ||
			!Container.session.signedIn ||
			!this.isApplicableEditor(editor)
		) {
			return;
		}
		if (editor && editor.document) {
			this.f(editor.document!);
		}
		console.log(force);
		// const decorations = await this.provideDecorations(editor!);
		// if (Object.keys(decorations).length === 0) {
		// 	this.clear(editor);
		// 	return;
		// }

		// for (const [key, value] of Object.entries(this._decorationTypes)) {
		// 	editor!.setDecorations(value, (decorations[key] as any) || emptyArray);
		// }
	}

	// findVars(symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
	// 	const vars = symbols.filter(
	// 		symbol => symbol !== undefined
	// 		//	symbol.kind === vscode.SymbolKind.Method || symbol.kind === vscode.SymbolKind.Function
	// 	);
	// 	return vars.concat(
	// 		symbols.map(symbol => this.findVars(symbol.children)).reduce((a, b) => a.concat(b), [])
	// 	);
	// }

	private async onEditorVisibilityChanged(editors: vscode.TextEditor[]) {
		for (const e of editors) {
			this.f(e.document);
		}
	}

	clear(editor: TextEditor | undefined = window.activeTextEditor) {
		if (editor === undefined || this._decorationTypes === undefined) return;

		// for (const decoration of Object.values(this._decorationTypes)) {
		// 	editor.setDecorations(decoration, emptyArray);
		// }
	}

	f(document: TextDocument) {
		if (document.languageId === "Log") return;
		const text = document.getText();
		const editor = window.activeTextEditor;
		if (!editor) return;

		let matches;

		let found = false;

		if (this._current.length) {
			this._current.forEach(_ => _.val.dispose());
			// this._current = [];
		}

		while ((matches = this.regex.exec(text)) !== null) {
			const line = document.lineAt(document.positionAt(matches.index).line);
			const indexOf = line.text.indexOf(matches[0]);
			const position = new vscode.Position(line.lineNumber, indexOf);
			const range = document.getWordRangeAtPosition(position, new RegExp(this.regex));
			if (range) {
				// const v = this._decorationTypes!["inline-comment-yellow"];

				// if (this._current.find(_ => _.start === range.start.line)) {
				// } else {
				const v = window.createTextEditorDecorationType({
					before: buildDecoration("inline")
				});

				this._current.push({
					val: v,
					start: range.start.line
				});
				editor!.setDecorations(v, [range]);
				// }
				found = true;

				// for (const [key, value] of Object.entries(this._decorationTypes!)) {
				// 	console.log(key);
				// 	e.setDecorations(this._decorationTypes!["inline-comment-yellow"], [range]);
				// }
			}
		}
		if (!found) {
			// 	if (this._current.length) {
			// 		this._current.forEach(_ => _.val.dispose());
			// 		// this._current = [];
			// 	}
		}
	}

	// private async onEditorVisibilityChanged2(editors: vscode.TextEditor[]) {
	// 	for (const e of editors) {
	// 		const text = e.document.getText();

	// 		// const foo = (await vscode.commands.executeCommand(
	// 		// 	BuiltInCommands.ExecuteDocumentSymbolProvider,
	// 		// 	e.document.uri
	// 		// )) as vscode.DocumentSymbol[];

	// 		// const list = [];
	// 		// for (const variable of this.findVars(foo)) {
	// 		// 	list.push(variable.name);
	// 		// }
	// 		// // const bar = await vscode.commands.executeCommand(
	// 		// // 	BuiltInCommands.ExecuteDocumentHighlights,
	// 		// // 	e.document.uri
	// 		// // );

	// 		// console.log(foo);

	// 		// const aaa = await vscode.commands.executeCommand(
	// 		// 	"vscode.provideDocumentSemanticTokens",
	// 		// 	e.document.uri
	// 		// );
	// 		// console.log(aaa);

	// 		const document = e.document;
	// 		let matches;

	// 		while ((matches = this.regex.exec(text)) !== null) {
	// 			const line = document.lineAt(document.positionAt(matches.index).line);
	// 			const indexOf = line.text.indexOf(matches[0]);
	// 			const position = new vscode.Position(line.lineNumber, indexOf);
	// 			const suc = await vscode.commands.executeCommand(
	// 				"vscode.executeDefinitionProvider",
	// 				e.document.uri,
	// 				position
	// 			);
	// 			console.log(suc);
	// 			const range = document.getWordRangeAtPosition(position, new RegExp(this.regex));
	// 			if (range) {
	// 				e.setDecorations(this._decorationTypes!["inline-comment-yellow"], [range]);
	// 				// for (const [key, value] of Object.entries(this._decorationTypes!)) {
	// 				// 	console.log(key);
	// 				// 	e.setDecorations(this._decorationTypes!["inline-comment-yellow"], [range]);
	// 				// }
	// 			}
	// 		}
	// 	}
	// }

	async provideHover(
		document: TextDocument,
		position: Position,
		token: CancellationToken
	): Promise<Hover | undefined> {
		const regex = new RegExp(this.regex);
		console.log(position, token);

		const line = document.lineAt(position.line);

		// // const indexOf = line.text.indexOf(matches[0]);
		// // 	const position = new vscode.Position(line.lineNumber, indexOf);
		// const range = document.getWordRangeAtPosition(position, new RegExp(this.regex));
		// const text = document.getText(range);
		const matches = regex.exec(line.text);

		if (matches) {
			let message = "";
			message += ` \n\n[__View Custom Transaction \u2197__](command:codestream.instrumentationOpen?${encodeURIComponent(
				JSON.stringify({ name: matches[2].replace(/['"]/g, "") })
			)} " View Custom Transaction")`;
			const markdown = new vscode.MarkdownString(message, true);
			markdown.isTrusted = true;
			return new Hover(markdown, line.range);
		}

		return undefined;
	}
}
