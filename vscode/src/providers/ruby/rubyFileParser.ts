
import { CancellationToken } from "vscode-languageclient";

export interface ICodeBlock {
	name: string;
	type: string;
	startLine: number;
	endLine?: number;
	containerName?: string;
}

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
		return this.line.trim().endsWith("end");
	}
	getBlockName(blockType: string) {
		if (blockType === "class") {
			const match = this.line.match(/class\s+(\S+)/);
			if (match && match.length > 0) {
				const clazz = match[1];
				return clazz;
			}
			throw Error(`Unable to parse block ${this.line}`);
		}
		if (blockType === "module") {
			return this.line.replace("module", "").trim();
		}
		if (blockType === "def") {
			return this.line.split(";")[0].replace("def", "").trim();
		}
		return "";
	}
}

const _ = {
	includes: (array: any, value: any) => array.indexOf(value) !== -1
};

export class FileParser {
	fileText: string;
	lines: string[];

	constructor(fileText: string, token: CancellationToken, document: any) {
		this.fileText = fileText;
		this.lines = this.fileText.split("\n");
	}
	symbolInformations(): ICodeBlock[] {
		const blocks: ICodeBlock[] = [];
		const stack: ICodeBlock[] = [];
		this.lines.forEach((line, index) => {
			const lineParse = new LineParse(line);
			if (lineParse.isBlock()) {
				const blockType = lineParse.getBlockType();
				const incompleteBlock: ICodeBlock = {
					name: lineParse.getBlockName(blockType!)!,
					startLine: index + 1,
					type: blockType!
				};
				stack.push(incompleteBlock);
			}
			if (lineParse.isEndBlock()) {
				const lastBlock = stack.pop(); // remove the last element in the stack and return the last element
				if (!lastBlock) return console.log("current stack", stack);
				lastBlock.endLine = index + 1;
				const parent = stack[stack.length - 1];
				if (parent) {
					lastBlock.containerName = parent.name;
				}
				blocks.push(lastBlock);
			}
		});
		return this.getPermitedBlocks(blocks);
	}

	getPermitedBlocks(blocks: ICodeBlock[]) {
		return blocks.filter(
			(block: ICodeBlock) => block.endLine && _.includes(["def", "class", "module"], block.type)
		);
	}
}
