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
	CancellationToken,
	DocumentSymbol,
	ProviderResult
} from "vscode";
import { FileParser, ICodeBlock } from "./rubyFileParser";

function symbolKind(type: string): SymbolKind {
	switch (type) {
		case "class":
			return SymbolKind.Class;
		case "module":
			return SymbolKind.Module;
		default:
			return SymbolKind.Method;
	}
}

function iCodeBlockToDocumentSymbol(symbolInformation: ICodeBlock): DocumentSymbol {
	const { name, type, startLine, endLine } = symbolInformation;
	const range = new Range(new Position(startLine, 0), new Position(endLine!, 0));
	return new DocumentSymbol(name, name, symbolKind(type), range, range);
}

export class RubyDocumentSymbolProvider implements DocumentSymbolProvider {
	provideDocumentSymbols(
		document: TextDocument,
		token: CancellationToken
	): ProviderResult<SymbolInformation[] | DocumentSymbol[]> {
		const fileText = document.getText();
		const symbolInformations = new FileParser(fileText, token, document).symbolInformations();

		const response: DocumentSymbol[] = [];

		const containerList = symbolInformations.filter(
			item => item.type === "class" || item.type === "module"
		);
		if (containerList.length > 0) {
			for (const container of containerList) {
				const children = symbolInformations.filter(item => item.containerName === container.name);
				const documentSymbol = iCodeBlockToDocumentSymbol(container);
				documentSymbol.children = children.map(iCodeBlockToDocumentSymbol);
				response.push(documentSymbol);
			}
		}

		// include methods without parent class

		response.push(
			...symbolInformations
				.filter(item => item.type === "def" && !item.containerName)
				.map(iCodeBlockToDocumentSymbol)
		);

		return response;
	}
}
