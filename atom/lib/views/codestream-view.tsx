import {
	ConnectionStatus,
	DidChangeConnectionStatusNotificationType,
	DidChangeDataNotificationType,
	DidChangeDocumentMarkersNotificationType,
	DidChangeVersionCompatibilityNotification,
	DidChangeVersionCompatibilityNotificationType,
	DidEncounterMaintenanceModeNotificationType,
	GetDocumentFromMarkerRequestType,
	ReportingMessageType,
	ReportMessageRequestType,
	SetServerUrlRequestType,
	TraceLevel
} from "@codestream/protocols/agent";
import { CodemarkType } from "@codestream/protocols/api";
import {
	ApplyMarkerRequest,
	ApplyMarkerRequestType,
	ApplyMarkerResponse,
	BootstrapInHostRequestType,
	BootstrapInHostResponse,
	CompareMarkerRequest,
	CompareMarkerRequestType,
	CompareMarkerResponse,
	EditorContext,
	EditorHighlightRangeRequestType,
	EditorHighlightRangeResponse,
	EditorRevealRangeRequest,
	EditorRevealRangeRequestType,
	EditorRevealRangeResponse,
	EditorScrollToNotification,
	EditorScrollToNotificationType,
	EditorSelectRangeRequest,
	EditorSelectRangeRequestType,
	EditorSelectRangeResponse,
	GetActiveEditorContextRequestType,
	GetActiveEditorContextResponse,
	HostDidChangeActiveEditorNotification,
	HostDidChangeActiveEditorNotificationType,
	HostDidChangeConfigNotificationType,
	HostDidChangeEditorSelectionNotificationType,
	HostDidChangeEditorVisibleRangesNotificationType,
	HostDidChangeFocusNotificationType,
	HostDidLogoutNotificationType,
	HostDidReceiveRequestNotificationType,
	InsertTextRequest,
	InsertTextRequestType,
	InsertTextResponse,
	isIpcRequestMessage,
	LogoutRequestType,
	LogoutResponse,
	NewCodemarkNotificationType,
	ReloadWebviewRequestType,
	RestartRequestType,
	ShellPromptFolderRequestType,
	ShellPromptFolderResponse,
	ShowCodemarkNotificationType,
	ShowPullRequestNotificationType,
	StartWorkNotificationType,
	UpdateConfigurationRequest,
	UpdateConfigurationRequestType,
	UpdateConfigurationResponse,
	UpdateServerUrlRequestType,
	WebviewContext,
	WebviewDidChangeContextNotificationType,
	WebviewDidInitializeNotificationType,
	WebviewIpcNotificationMessage,
	WebviewIpcRequestMessage,
	WebviewPanels,
	OpenUrlRequestType,
	OpenUrlRequest
} from "@codestream/protocols/webview";
import { CompositeDisposable, Disposable, Emitter, Point, Range, TextEditor } from "atom";
import { Convert } from "atom-languageclient";
import { remote, shell, WebviewTag } from "electron";
import * as fs from "fs-plus";
import { FileLogger } from "logger";
import { NotificationType } from "vscode-languageserver-protocol";
import { ConfigSchema } from "../configs";
import { asAbsolutePath, createTempFile, Debug, Echo, Editor } from "../utils";
import { Container } from "../workspace/container";
import { EditorObserver } from "../workspace/editor-observer";
import { SessionStatus, SignoutReason, WorkspaceSession } from "../workspace/workspace-session";
import { isViewVisible } from "./controller";

export const CODESTREAM_VIEW_URI = "atom://codestream";
export const DID_CHANGE_STATE = "state-changed";
export const WILL_DESTROY = "will-destroy";

export class CodestreamView {
	element: HTMLElement;
	private session: WorkspaceSession;
	private subscriptions: CompositeDisposable;
	private webview: WebviewTag;
	private emitter: Emitter;
	private webviewContext: any;
	private editorSelectionObserver?: EditorObserver;
	private logger: FileLogger;
	private timestamp = Date.now();
	private webviewReadyEmitter = new Echo();
	private _webviewInitialized = false;

	constructor(session: WorkspaceSession, webviewContext: any) {
		this.session = session;
		this.webviewContext = webviewContext;
		this.logger = new FileLogger("webview");
		this.emitter = new Emitter();
		this.subscriptions = new CompositeDisposable(
			this.logger,
			this.emitter,
			this.webviewReadyEmitter
		);
		this.element = document.createElement("div");
		this.element.classList.add("codestream-view");
		this.webview = document.createElement("webview");

		this.webviewReadyEmitter.add(() => {
			this._webviewInitialized = true;
			this.initialize();
		});

		this.initializeWebview();
	}

	// update-able
	getTitle() {
		return "CodeStream";
	}

	// update-able
	getIconName() {
		return "comment-discussion";
	}

	getDefaultLocation() {
		return "right";
	}

	getAllowedLocations() {
		return ["right", "left"];
	}

	isPermanentDockItem() {
		return false;
	}

	getPreferredWidth() {
		return 300;
	}

	getURI() {
		return CODESTREAM_VIEW_URI;
	}

	whenWebviewInitialized(cb: () => void) {
		if (this._webviewInitialized) cb();
		else this.webviewReadyEmitter.once(cb);
	}

	async show() {
		await atom.workspace.open(this, { activatePane: true });
	}

	async showCodemark(codemarkId: string, sourceUri?: string) {
		await this.show();
		this.whenWebviewInitialized(() =>
			this.sendNotification(ShowCodemarkNotificationType, { codemarkId, sourceUri })
		);
	}

	async showPullRequest(providerId: string, id: string, commentId?: string) {
		await this.show();
		this.whenWebviewInitialized(() =>
			this.sendNotification(ShowPullRequestNotificationType, { providerId, id, commentId })
		);
	}

	private _htmlPath: string | undefined;

	private async getWebviewSrc() {
		if (!Debug.isDebugging() && this._htmlPath) return this._htmlPath;

		return new Promise<string>((resolve, reject) => {
			fs.readFile(asAbsolutePath("dist/webview/index.html"), "utf8", async (error, data) => {
				if (error) return reject(error);

				if (!this._htmlPath) {
					const htmlPath = (this._htmlPath = await createTempFile("codestream-atom-webview.html"));
					this.subscriptions.add(new Disposable(() => fs.remove(htmlPath, () => {})));
				}

				fs.writeFile(this._htmlPath, data.replace(/{{root}}/g, asAbsolutePath(".")), () =>
					resolve(this._htmlPath)
				);
			});
		});
	}

	private async initializeWebview() {
		this.webview.src = await this.getWebviewSrc();
		this.webview.preload = asAbsolutePath("dist/webview/preload.js");
		this.webview.plugins = true;

		this.webview.classList.add("codestream-webview", "native-key-bindings");
		this.webview.addEventListener("dom-ready", async () => {
			this.subscriptions.add(
				atom.commands.add("atom-workspace", "codestream:open-webview-devtools", () =>
					this.webview.openDevTools()
				)
			);
		});
		this.webview.addEventListener("ipc-message", async event => {
			switch (event.channel) {
				case "ready": {
					this.webview.send("initialize", {
						styles: await Container.styles.getStylesheets(),
						isDebugging: Debug.isDebugging()
					});
					this.subscriptions.add(
						Container.styles.onDidChange(styles => {
							this.webview.send("did-change-styles", styles);
						})
					);
					break;
				}
				case "did-keydown": {
					this._handleKeydownEvent(event.args[0]);
					break;
				}
				case "did-log": {
					const { type, message, args } = event.args[0];
					this.logger.log(type, message, JSON.stringify(args));
					break;
				}
				case "did-click-link": {
					const url = event.args[0];
					shell.openExternal(url);
					break;
				}
				case "codestream-ui": {
					const data = event.args[0];
					if (isIpcRequestMessage(data)) {
						const target = data.method.split("/")[0];
						if (target === "host") {
							// @ts-ignore
							requestIdleCallback(() => {
								this.handleWebviewRequest(data)
									.then(result => {
										if (result) this.webview.send("codestream-ui", { id: data.id, ...result });
									})
									.catch(error => {
										this.webview.send("codestream-ui", { id: data.id, error: error.message });
									});
							});
						} else {
							// @ts-ignore
							requestIdleCallback(async () => {
								this.forwardWebviewRequest(data)
									.then(result => {
										this.webview.send("codestream-ui", { id: data.id, ...result });
									})
									.catch(error => {
										this.webview.send("codestream-ui", { id: data.id, error: error.message });
									});
							});
						}
					} else this.onWebviewNotification(data as WebviewIpcNotificationMessage);
					break;
				}
			}
		});

		this.element.append(this.webview);
	}

	private _handleKeydownEvent(event: KeyboardEvent) {
		if (["Alt", "Meta", "Control", "Shift", "CapsLock"].includes(event.key)) return;

		if (event.shiftKey) {
			if (event.metaKey && event.key === "z") {
				this.webview.redo();
			}
			return;
		}

		if (event.metaKey) {
			switch (event.key) {
				case "a":
					this.webview.selectAll();
					break;
				case "c":
					this.webview.copy();
					break;
				case "v":
					this.webview.paste();
					break;
				case "x":
					this.webview.cut();
					break;
				case "z":
					this.webview.undo();
					break;
				default:
			}
		}

		const emulatedKeyboardEvent = new KeyboardEvent("keydown", event);

		Object.defineProperty(emulatedKeyboardEvent, "target", {
			get: () => this.webview
		});
		// not sure this is worth it
		atom.keymaps.handleKeyboardEvent(emulatedKeyboardEvent);
	}

	private _observeWorkspace() {
		this.editorSelectionObserver = new EditorObserver();
		this.editorSelectionObserver.onDidChangeSelection(this._onSelectionChanged);
		this.editorSelectionObserver.onDidChangeActiveEditor(this._onEditorActiveEditorChanged);
		this.editorSelectionObserver.onDidChangeVisibleRanges(editor => {
			this.sendNotification(HostDidChangeEditorVisibleRangesNotificationType, {
				uri: Editor.getUri(editor),
				selections: Editor.getCSSelections(editor),
				visibleRanges: Editor.getVisibleRanges(editor),
				lineCount: editor.getLineCount()
			});
		});
	}

	private initialize() {
		const onBlur = () => {
			if (isViewVisible(this.getURI())) {
				this.sendNotification(HostDidChangeFocusNotificationType, { focused: false });
			}
		};
		const onFocus = () => {
			if (isViewVisible(this.getURI())) {
				this.sendNotification(HostDidChangeFocusNotificationType, { focused: true });
			}
		};

		const window = remote.getCurrentWindow();
		window.on("focus", onFocus);
		window.on("blur", onBlur);

		if (this.session.isSignedIn) this._observeWorkspace();

		this.subscriptions.add(
			new Disposable(() => {
				window.removeListener("blur", onBlur);
				window.removeListener("focus", onFocus);
			}),
			this.session.agent.onDidChangeData(data =>
				this.sendNotification(DidChangeDataNotificationType, data)
			),
			this.session.onDidChangeSessionStatus(change => {
				if (change.current === SessionStatus.SignedIn) {
					this._observeWorkspace();
				}
				if (
					change.current === SessionStatus.SignedOut &&
					change.signoutReason === SignoutReason.Extension
				) {
					this.sendNotification(HostDidLogoutNotificationType, {});
				}
			}),
			this.session.agent.onDidChangeDocumentMarkers(e =>
				this.sendNotification(DidChangeDocumentMarkersNotificationType, e)
			),
			Container.configs.onDidChangeWebviewConfig(changes =>
				this.sendNotification(HostDidChangeConfigNotificationType, changes)
			),
			this.session.agent.onDidChangeConnectionStatus(e => {
				switch (e.status) {
					case ConnectionStatus.Disconnected: {
						break;
					}
					case ConnectionStatus.Reconnecting: {
						this.sendNotification(DidChangeConnectionStatusNotificationType, e);
						break;
					}
					case ConnectionStatus.Reconnected: {
						if (e.reset) {
							this.destroy();
							// atom.workspace.paneForURI(CODESTREAM_VIEW_URI)!.destroy();
							atom.workspace.open(CODESTREAM_VIEW_URI);
							break;
						}
						this.sendNotification(DidChangeConnectionStatusNotificationType, e);
						break;
					}
				}
			}),
			this.session.agent.onDidEncounterMaintenanceMode(e => {
				this.sendNotification(DidEncounterMaintenanceModeNotificationType, e);
			})
		);
	}

	changeVersionCompatibility(e: DidChangeVersionCompatibilityNotification) {
		atom.workspace.open(CODESTREAM_VIEW_URI);
		this.sendNotification(DidChangeVersionCompatibilityNotificationType, e);
	}

	serialize() {
		return {
			deserializer: "codestream/CodestreamView"
		};
	}

	destroy() {
		Container.markerDecorationProvider.enable();
		this.emitter.emit(WILL_DESTROY);
		this.element.remove();
		this.editorSelectionObserver && this.editorSelectionObserver.dispose();
		this.subscriptions.dispose();
	}

	onWillDestroy(cb: () => void) {
		return this.emitter.on(WILL_DESTROY, cb);
	}

	onDidChangeState(cb: (state: WebviewContext) => void) {
		return this.emitter.on(DID_CHANGE_STATE, cb);
	}

	checkToToggleMarkers() {
		if (!this.webviewContext || !Container.session.isSignedIn) return;

		const configs = Container.configs;
		if (configs.get("showMarkers") === true && configs.get("autoHideMarkers") === true) {
			if (this.webviewContext.panelStack[0] === WebviewPanels.CodemarksForFile) {
				if (isViewVisible(this.getURI())) {
					Container.markerDecorationProvider.disable();
				} else Container.markerDecorationProvider.enable();
			} else Container.markerDecorationProvider.enable();
		}
	}

	private getActiveEditorContext(): EditorContext {
		const editor = atom.workspace.getActiveTextEditor();
		if (editor) {
			const uri = Editor.getUri(editor);
			return {
				activeFile: Editor.getRelativePath(editor),
				textEditorUri: uri,
				textEditorVisibleRanges: Editor.getVisibleRanges(editor),
				textEditorSelections: Editor.getCSSelections(editor),
				textEditorLineCount: editor.getLineCount()
			};
		}
		return {};
	}

	private async forwardWebviewRequest(request: { id: string; method: string; params?: any }) {
		const response = await this.session.agent.sendRequest(request.method, request.params);
		return { params: response };
	}

	private async handleWebviewRequest(
		message: WebviewIpcRequestMessage
	): Promise<{ params: any } | { error: any } | void> {
		switch (message.method) {
			case BootstrapInHostRequestType.method: {
				try {
					// TODO: is this still necessary?
					await this.session.ready;

					const response: BootstrapInHostResponse = {
						...this.session.getBootstrapInfo(),
						context: this.webviewContext || {
							currentTeamId: this.session.isSignedIn ? this.session.teamId : undefined
						}
					};

					return { params: response };
				} catch (error) {
					return { error: error.message };
				}
			}
			case ShellPromptFolderRequestType.method: {
				const result = await remote.dialog.showOpenDialog({
					title: message.params.message,
					properties: ["openDirectory"]
				});
				const response: ShellPromptFolderResponse = {
					path: result.filePaths && result.filePaths.length ? result.filePaths[0] : undefined
				};
				return { params: response };
			}
			case GetActiveEditorContextRequestType.method: {
				return {
					params: {
						editorContext: this.getActiveEditorContext()
					} as GetActiveEditorContextResponse
				};
			}
			case UpdateConfigurationRequestType.method: {
				const { name, value }: UpdateConfigurationRequest = message.params;
				if (Container.configs.isUserSetting(name)) {
					Container.configs.set(name as keyof ConfigSchema, value);
				}
				this.sendNotification(HostDidChangeConfigNotificationType, { [name]: value });
				return { params: {} as UpdateConfigurationResponse };
			}
			case UpdateServerUrlRequestType.method: {
				const { serverUrl, disableStrictSSL } = message.params;
				await Container.configs.set("serverUrl", serverUrl);
				await Container.configs.set("disableStrictSSL", disableStrictSSL);
				await this.session.agent.sendRequest(SetServerUrlRequestType.method, {
					serverUrl,
					disableStrictSSL
				});
				return { params: {} };
			}
			case EditorHighlightRangeRequestType.method: {
				const { uri, highlight, range } = message.params;
				const success = await Container.editorManipulator.highlight(
					highlight,
					Convert.uriToPath(uri),
					Convert.lsRangeToAtomRange(range)
				);
				return { params: { success } as EditorHighlightRangeResponse };
			}
			case EditorSelectRangeRequestType.method: {
				const { selection, uri, preserveFocus }: EditorSelectRangeRequest = message.params;

				try {
					await Container.editorManipulator.select(
						Convert.uriToPath(uri),
						Convert.lsRangeToAtomRange(selection)
					);

					if (preserveFocus) {
						atom.views.getView(this).focus();
						this.webview.focus();
					}

					return { params: { success: true } as EditorSelectRangeResponse };
				} catch (error) {
					this.session.agent.request(ReportMessageRequestType, {
						message: "Could not select range in buffer",
						type: ReportingMessageType.Error,
						source: "extension",
						extra: error
					});
					return { params: { success: false } as EditorSelectRangeResponse };
				}
			}
			case EditorRevealRangeRequestType.method: {
				const { uri, range } = message.params as EditorRevealRangeRequest;
				const success = atom.workspace.getTextEditors().some(editor => {
					if (editor.getPath() === Convert.uriToPath(uri)) {
						// TODO: compute the scroll position that will make `range.start.row` the first visible line
						editor.scrollToBufferPosition(Convert.lsRangeToAtomRange(range).start);
						return true;
					}
					return false;
				});

				return { params: { success } as EditorRevealRangeResponse };
			}
			case CompareMarkerRequestType.method: {
				const { marker }: CompareMarkerRequest = message.params;
				await Container.diffController.showDiff(marker);
				return { params: {} as CompareMarkerResponse };
			}
			case ApplyMarkerRequestType.method: {
				const { marker }: ApplyMarkerRequest = message.params;
				await Container.diffController.applyPatch(marker);
				return { params: {} as ApplyMarkerResponse };
			}
			case LogoutRequestType.method: {
				await this.session.signOut(SignoutReason.User);
				return { params: {} as LogoutResponse };
			}
			case ReloadWebviewRequestType.method: {
				// TODO: technically, just the iframe could be replaced
				Container.viewController.reload(this.getURI());
				return;
			}
			case RestartRequestType.method: {
				await this.session.signOut(SignoutReason.User);
				Container.viewController.reload(this.getURI());
				return;
			}
			case InsertTextRequestType.method: {
				const { text, marker } = message.params as InsertTextRequest;

				let response: InsertTextResponse = false;

				const documentMarkerInfo = await Container.session.agent.request(
					GetDocumentFromMarkerRequestType,
					{
						markerId: marker.id
					}
				);

				if (documentMarkerInfo) {
					const editor = await Container.editorManipulator.open(
						Convert.uriToPath(documentMarkerInfo.textDocument.uri)
					);

					if (editor) {
						const bufferRange = Convert.lsRangeToAtomRange(documentMarkerInfo.range);
						editor.setTextInBufferRange(
							[[bufferRange.start.row, 0], [bufferRange.start.row, 0]],
							text
						);
						response = true;
					}
				}

				return { params: response as InsertTextResponse };
			}
			case OpenUrlRequestType.method: {
				shell.openExternal((message.params as OpenUrlRequest).url);
				return {} as any;
			}
			default: {
				if (Debug.isDebugging()) {
					atom.notifications.addWarning(`Unhandled webview message: ${message.method}`);
					if (atom.inDevMode() && Container.configs.get("traceLevel") === TraceLevel.Debug) {
						atom.notifications.addWarning(`Unhandled webview request: ${message.method}`);
					}
				} else if (Container.session.isSignedIn) {
					Container.session.agent.request(ReportMessageRequestType, {
						type: ReportingMessageType.Warning,
						message: `Unhandled request from webview: ${message.method}`,
						source: "extension"
					});
				}
				return { error: "No handler found" };
			}
		}
	}

	private onWebviewNotification(event: WebviewIpcNotificationMessage) {
		switch (event.method) {
			case WebviewDidInitializeNotificationType.method: {
				if (Debug.isDebugging()) {
					console.debug(
						`CodeStream view created and interactive in ${Date.now() - this.timestamp} `
					);
				}
				this.webviewReadyEmitter.push();
				break;
			}
			case WebviewDidChangeContextNotificationType.method: {
				this.webviewContext = event.params.context;
				this.emitter.emit(DID_CHANGE_STATE, event.params.context);
				this.checkToToggleMarkers();
				break;
			}
			case EditorScrollToNotificationType.method: {
				const { atTop, uri, position, deltaPixels }: EditorScrollToNotification = event.params;
				const editor = atom.workspace.getTextEditors().find(e => Editor.getUri(e) === uri);
				if (!editor) return;
				if (atTop) {
					editor.setScrollTopRow(editor.screenRowForBufferRow(position.line));
				} else {
					editor.element.setScrollTop(editor.element.getScrollTop() + deltaPixels!);
				}
				break;
			}
			default: {
				Container.session.agent.request(ReportMessageRequestType, {
					type: ReportingMessageType.Warning,
					message: `Unhandled notification from webview: ${event.method}`,
					source: "extension"
				});
				if (atom.inDevMode() && Container.configs.get("traceLevel") === TraceLevel.Debug) {
					atom.notifications.addWarning(`Unhandled webview notification: ${event.method}`);
				}
			}
		}
	}

	sendNotification<ET extends NotificationType<any, any>>(
		eventType: ET,
		params: ET extends NotificationType<infer P, any> ? P : never
	) {
		this.webview.send("codestream-ui", { method: eventType.method, params });
	}

	newCodemarkRequest(type: CodemarkType, source?: string) {
		const editor = atom.workspace.getActiveTextEditor();
		if (editor === undefined) return;

		const uri = Editor.getUri(editor);
		const range = Editor.getCurrentSelectionRange(editor);
		this.sendNotification(NewCodemarkNotificationType, { type, uri, range, source });
		editor.setSelectedBufferRange(Convert.lsRangeToAtomRange(range));
	}

	startWorkRequest(source?: string) {
		const editor = atom.workspace.getActiveTextEditor();
		let uri;
		if (editor) {
			uri = Editor.getUri(editor);
		}
		this.sendNotification(StartWorkNotificationType, { source, uri });
	}

	handleProtocolRequest(uri: string) {
		this.sendNotification(HostDidReceiveRequestNotificationType, { url: uri });
	}

	private _onSelectionChanged = (event: { editor: TextEditor; range: Range; cursor: Point }) => {
		this.sendNotification(HostDidChangeEditorSelectionNotificationType, {
			uri: Editor.getUri(event.editor),
			selections: Editor.getCSSelections(event.editor),
			visibleRanges: Editor.getVisibleRanges(event.editor),
			lineCount: event.editor.getLineCount()
		});
	};

	private _onEditorActiveEditorChanged = (editor?: TextEditor) => {
		const notification: HostDidChangeActiveEditorNotification = {};
		const fileName = editor && Editor.getRelativePath(editor);
		if (editor) {
			notification.editor = {
				fileName: fileName || "",
				uri: Editor.getUri(editor),
				visibleRanges: Editor.getVisibleRanges(editor),
				selections: Editor.getCSSelections(editor),
				metrics: {
					lineHeight: editor.getLineHeightInPixels(),
					fontSize: atom.config.get("editor.fontSize")
				},
				lineCount: editor.getLineCount()
			};
		}
		this.sendNotification(HostDidChangeActiveEditorNotificationType, notification);
	};
}
