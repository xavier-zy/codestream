/** https://github.com/MiguelSavignano/vscode-ruby-symbols/blob/master/LICENSE.md
The MIT License (MIT)

Copyright (c) 2015 Miguel Savignano

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

import {
	SymbolInformation,
	SymbolKind,
	Range,
	Position,
	DocumentSymbolProvider,
	TextDocument,
	CancellationToken
} from "vscode";

interface ICodeBlock {
	name: string;
	type: string;
	startLine: number;
	endLine?: number;
}

interface ICodeBlockComplete {
	name: string;
	type: "class" | "def";
	startLine: number;
	endLine: number;
}

export class FileParser {
	fileText: string;
	lines: string[];

	constructor(fileText: string, token: CancellationToken, document: any) {
		this.fileText = fileText;
		this.lines = this.fileText.split("\n");
	}
	symbolInformations(): ICodeBlockComplete[] {
		let blocks: any[] = [];
		let stack: any[] = [];
		this.lines.forEach((line, index) => {
			const lineParse = new LineParse(line);
			if (lineParse.isBlock()) {
				const blockType = lineParse.getBlockType();
				const incompleteBlock: ICodeBlock = {
					name: lineParse.getBlockName(blockType!)!,
					startLine: index,
					type: blockType!
				};
				stack = [incompleteBlock, ...stack];
			} else if (lineParse.isEndBlock()) {
				const lastBlock = stack.shift(); // remove the last element in the stack and return the last element
				if (!lastBlock) return console.log("current stack", stack);
				lastBlock.endLine = index;
				blocks = [...blocks, lastBlock];
			}
		});
		return this.getPermitedBlocks(blocks);
	}

	getPermitedBlocks(blocks: any) {
		return blocks.filter(
			(block: any) => block.endLine && _.includes(["def", "class", "module"], block.type)
		);
	}
}

// const blockTypes = ["class", "module", "def", "do", "if", "unless", "case", "begin", "scope"];

class LineParse {
	private line: string;
	constructor(line: string) {
		this.line = line;
	}
	isAClassBlock() {
		return /class /.test(this.line);
	}
	isAModuleBlock() {
		return /module /.test(this.line);
	}
	isAMethodBlock() {
		return /def /.test(this.line);
	}
	isAFunctionBlock() {
		return this.line.split(" ").some((word: any) => word === "do");
	}
	isACaseBlock() {
		return /case /.test(this.line);
	}
	isAExceptionHandlerBlock() {
		return /( begin|begin )/.test(this.line);
	}
	isAConditionalBlock() {
		if (/if /.test(this.line)) {
			return !/\w/.test(this.line.split("if")[0]);
		} else if (/unless /.test(this.line)) {
			return !/\w/.test(this.line.split("unless")[0]);
		}
		return undefined;
	}
	isBlock() {
		return (
			this.isAClassBlock() ||
			this.isAModuleBlock() ||
			this.isAMethodBlock() ||
			this.isAFunctionBlock() ||
			this.isACaseBlock() ||
			this.isAConditionalBlock() ||
			this.isAExceptionHandlerBlock()
		);
	}
	getBlockType() {
		if (this.isAClassBlock()) {
			return "class";
		}
		if (this.isAModuleBlock()) {
			return "module";
		}
		if (this.isAMethodBlock()) {
			return "def";
		}
		if (this.isAFunctionBlock()) {
			return "do";
		}
		if (this.isACaseBlock()) {
			return "case";
		}
		if (this.isAConditionalBlock()) {
			return "if";
		}
		if (this.isAExceptionHandlerBlock()) {
			return "begin";
		}
		return undefined;
	}
	isEndBlock() {
		return this.line.trim() === "end";
	}
	getBlockName(blockType: string) {
		if (blockType === "class") {
			return this.line.replace("class", "").trim();
		}
		if (blockType === "module") {
			return this.line.replace("module", "").trim();
		}
		if (blockType === "def") {
			return this.line.replace("def", "").trim();
		}
		return "";
	}
}

const _ = {
	includes: (array: any, value: any) => array.indexOf(value) !== -1
};

export class RubyDocumentSymbolProvider implements DocumentSymbolProvider {
	provideDocumentSymbols(document: TextDocument, token: CancellationToken) {
		const fileText = document.getText();
		const symbolInformations = new FileParser(fileText, token, document).symbolInformations();

		return symbolInformations.map(symbolInformation => {
			const { name, type, startLine, endLine } = symbolInformation;
			const symbolKinds = {
				class: SymbolKind.Class,
				def: SymbolKind.Method
			};
			const rage = new Range(new Position(startLine, 0), new Position(endLine, 0));
			return new SymbolInformation(name, symbolKinds[type], rage);
		});
	}
}
