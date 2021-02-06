import {
	DocumentMarker,
	FetchDocumentMarkersRequestType,
	ChangeDataType
} from "@codestream/protocols/agent";
import { CSMePreferences } from "@codestream/protocols/api";
import {
	CompositeDisposable,
	DisplayMarker,
	DisplayMarkerLayer,
	Disposable,
	TextEditor
} from "atom";
import { Convert } from "atom-languageclient";
import { asAbsolutePath, Editor } from "utils";
import { ViewController } from "views/controller";
import { Container } from "./container";
import { SessionStatus, WorkspaceSession } from "./workspace-session";

interface DefaultCreator<K = any, V = any> {
	(key: K): V;
}

class MapWithDefaults<K, V> extends Map<K, V> {
	private createDefault: DefaultCreator<K, V>;

	constructor(createDefault: DefaultCreator, entries?: readonly [K, V][]) {
		super(entries);
		this.createDefault = createDefault;
	}

	get(key: K): V {
		let value = super.get(key);
		if (value) return value;

		value = this.createDefault(key);
		this.set(key, value);
		return value;
	}
}

export class MarkerDecorationProvider implements Disposable {
	private session: WorkspaceSession;
	private viewController: ViewController;
	private subscriptions: CompositeDisposable;
	private sessionSubscriptions = new CompositeDisposable();
	private observedEditors = new Map<number, TextEditor>();
	private markerLayers = new Map<number, DisplayMarkerLayer>();
	private markers = new Map<string, DisplayMarker>();
	private editorResources = new MapWithDefaults<number, CompositeDisposable>(
		() => new CompositeDisposable()
	);
	private disabled = false;
	private _lastPreferences?: {
		codemarksShowPRComments?: boolean;
		codemarksHideReviews?: boolean;
		codemarksHideResolved?: boolean;
		codemarksShowArchived?: boolean;
	};

	constructor(session: WorkspaceSession, viewController: ViewController) {
		this.session = session;
		this.viewController = viewController;

		this.subscriptions = new CompositeDisposable(
			session.observeSessionStatus(status => {
				switch (status) {
					case SessionStatus.SignedOut: {
						this.reset();
						break;
					}
					case SessionStatus.SignedIn: {
						if (Container.configs.get("showMarkers")) this.initialize();
						break;
					}
				}
			})
		);

		Container.configs.onDidChange("showMarkers", ({ newValue }) =>
			newValue === true ? this.initialize() : this.reset()
		);
	}

	dispose() {
		this.reset();
		this.subscriptions.dispose();
	}

	disable() {
		if (this.disabled) return;

		this.disabled = true;
		this.reset();
	}

	enable() {
		if (!this.disabled) return;

		this.disabled = false;
		this.initialize();
	}

	private initialize() {
		const preferences = (this.session.user ? this.session.user.preferences : {}) || {};
		this._lastPreferences = {
			codemarksShowPRComments: !!preferences.codemarksShowPRComments,
			codemarksHideReviews: !!preferences.codemarksHideReviews,
			codemarksHideResolved: !!preferences.codemarksHideResolved,
			codemarksShowArchived: !!preferences.codemarksShowArchived
		};
		this.sessionSubscriptions.add(
			atom.workspace.observeActiveTextEditor(this.onActiveEditor),
			this.session.agent.onDidChangeDocumentMarkers(({ textDocument }) => {
				for (const editor of this.observedEditors.values()) {
					if (Editor.getUri(editor) === textDocument.uri) {
						this.decorateEditor(editor);
						break;
					}
				}
			}),
			this.session.agent.onDidChangeData(event => {
				if (event.type === ChangeDataType.Preferences) {
					const preferences = event.data as CSMePreferences;
					const currentPreferences = {
						codemarksShowPRComments: !!preferences.codemarksShowPRComments,
						codemarksHideReviews: !!preferences.codemarksHideReviews,
						codemarksHideResolved: !!preferences.codemarksHideResolved,
						codemarksShowArchived: !!preferences.codemarksShowArchived
					};
					if (JSON.stringify(currentPreferences) !== JSON.stringify(this._lastPreferences)) {
						// set the reset flag to true if we need to re-fetch
						for (const editor of this.observedEditors.values()) {
							this.decorateEditor(editor);
						}
					}
					this._lastPreferences = currentPreferences;
				}
			})
		);
	}

	private onActiveEditor = (editor?: TextEditor) => {
		if (this.disabled) return;
		if (editor === undefined || editor.getPath() === undefined) return;

		if (!this.observedEditors.has(editor.id)) {
			this.observedEditors.set(editor.id, editor);
			const editorResources = this.editorResources.get(editor.id);

			editorResources.add(
				editor.onDidDestroy(() => {
					this.observedEditors.delete(editor.id);
				})
			);
		}

		this.decorateEditor(editor);
	};

	private async decorateEditor(editor: TextEditor) {
		const response = await this.session.agent.request(FetchDocumentMarkersRequestType, {
			textDocument: { uri: Convert.pathToUri(editor.getPath()!) },
			applyFilters: true
		});

		if (response && response.markers) {
			this.markers.forEach(displayMarker => displayMarker.destroy());
			this.markers.clear();

			// response.markers = response.markers.filter(m => {
			// 	if (m.codemark == null) return false;
			// 	// if (m.codemark.color === "none" || !m.codemark.pinned) return false;
			// 	// if (m.codemark.type === CodemarkType.Issue) {
			// 	// return m.codemark.status === CodemarkStatus.Open;
			// 	// }
			// 	return true;
			// });
			response.markers.map(docMarker => this.createMarker(editor, docMarker));
		}
	}

	private createMarker(editor: TextEditor, docMarker: DocumentMarker) {
		let markerLayer = this.markerLayers.get(editor.id);
		if (markerLayer === undefined) {
			markerLayer = editor.addMarkerLayer();
			this.markerLayers.set(editor.id, markerLayer);
			this.editorResources.get(editor.id).add(
				markerLayer.onDidDestroy(() => {
					this.markerLayers.delete(editor.id);
					const gutter = editor.gutterWithName(this.getGutterName(editor.id));
					if (gutter != null) gutter.hide();
				})
			);
		}

		const marker = this.getOrCreateDisplayMarker(docMarker, markerLayer);

		// for now, `createMarker` is invoked with docMarkers guaranteed to have codemarks
		const codemark = docMarker.codemark;

		let color = "";
		let type = "";
		if (codemark) {
			color = !codemark.pinned ? "gray" : codemark.status === "closed" ? "purple" : "green";
			color = color === "none" ? "" : `-${color}`;
			type = codemark.type;
		} else {
			color = "-gray";
			type = docMarker.type;
		}

		const iconPath = Convert.pathToUri(asAbsolutePath(`dist/icons/marker-${type}${color}.svg`));

		const img = document.createElement("img");
		img.src = iconPath;

		const item = document.createElement("div");
		item.onclick = event => {
			event.preventDefault();
			if (codemark) {
				this.viewController.getMainView().showCodemark(codemark.id, Editor.getUri(editor));
				Container.session.agent.telemetry({
					eventName: "Codemark Clicked",
					properties: { "Codemark Location": "Source File" }
				});
			} else if (docMarker.externalContent && docMarker.externalContent.provider) {
				const { provider, externalId, externalChildId } = docMarker.externalContent;
				if (externalId) {
					this.viewController
						.getMainView()
						.showPullRequest(provider.id, externalId, externalChildId);
				}
			}
		};

		const docMarkerBufferRange = Convert.lsRangeToAtomRange(docMarker.range);
		item.onmouseenter = event => {
			event.preventDefault();
			Container.editorManipulator.highlight(true, editor.getPath()!, docMarkerBufferRange);
		};
		item.onmouseleave = event => {
			event.preventDefault();
			Container.editorManipulator.highlight(false, editor.getPath()!, docMarkerBufferRange);
		};
		item.classList.add("codemark");
		item.appendChild(img);

		let gutter = editor.gutterWithName(this.getGutterName(editor.id));
		if (gutter == null) {
			gutter = editor.addGutter({
				name: this.getGutterName(editor.id)
			});
		}
		if (!gutter.isVisible()) {
			gutter.show();
		}

		const decoration = gutter.decorateMarker(marker, { item });

		const title =
			docMarker.summary.length > 80
				? `${docMarker.summary.substring(0, 80)}...`
				: docMarker.summary;

		const tooltip = atom.tooltips.add(img, {
			title: `${docMarker.creatorName}: ${title}`,
			placement: "right"
		});

		decoration.onDidDestroy(() => tooltip.dispose());
	}

	private getOrCreateDisplayMarker(
		docMarker: DocumentMarker,
		markerLayer: DisplayMarkerLayer
	): DisplayMarker {
		if (this.markers.has(docMarker.id)) {
			const displayMarker = this.markers.get(docMarker.id)!;
			if (!displayMarker.isDestroyed()) {
				displayMarker.setBufferRange(Convert.lsRangeToAtomRange(docMarker.range));
				return displayMarker;
			}

			this.markers.delete(docMarker.id);
		}

		const docMarkerBufferRange = Convert.lsRangeToAtomRange(docMarker.range);

		const displayMarker = markerLayer.markBufferRange({
			start: docMarkerBufferRange.start,
			end: docMarkerBufferRange.start
		});
		displayMarker.onDidDestroy(() => {
			this.markers.delete(docMarker.id);
		});
		this.markers.set(docMarker.id, displayMarker);

		return displayMarker;
	}

	private getGutterName(editorId: number) {
		return `codestream-${editorId}`;
	}

	private reset() {
		this.sessionSubscriptions.dispose();
		this.sessionSubscriptions = new CompositeDisposable();
		this.observedEditors.clear();
		this.editorResources.forEach(disposable => disposable.dispose());
		this.markerLayers.forEach(layer => layer.destroy());
		this.markerLayers.clear();
	}
}
