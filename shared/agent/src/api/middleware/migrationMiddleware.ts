"use strict";
import { Disposable, Emitter, Event } from "vscode-languageserver";
import { log } from "../../system";
import {
	ApiProvider,
	CodeStreamApiMiddleware,
	CodeStreamApiMiddlewareContext
} from "../apiProvider";

export interface MigrationStatusChangedEvent {
	migrating?: boolean;
	requiresRestart?: boolean;
}

export class MigrationMiddlewareManager implements Disposable {
	private _onDidChangeMigrationStatus = new Emitter<MigrationStatusChangedEvent>();
	get onDidChangeMigrationStatus(): Event<MigrationStatusChangedEvent> {
		return this._onDidChangeMigrationStatus.event;
	}

	private readonly _disposable: Disposable;

	constructor(private readonly _api: ApiProvider) {
		this._disposable = this._api.useMiddleware(new MigrationMiddleware(this));
	}

	dispose() {
		this._disposable && this._disposable.dispose();
	}

	@log()
	async notify(payload: MigrationStatusChangedEvent) {
		this._onDidChangeMigrationStatus.fire(payload);
	}
}

export class MigrationMiddleware implements CodeStreamApiMiddleware {
	constructor(private _manager: MigrationMiddlewareManager) {}

	get name() {
		return "Migration";
	}

	async onResponse<R>(context: Readonly<CodeStreamApiMiddlewareContext>, responseJson: Promise<R>) {
		if (context.response === undefined) return;

		const apiMigrating = context.response.headers.get("X-CS-Migration-Error") || "";
		if (!apiMigrating) {
			return;
		}

		if (apiMigrating === "CCMG-1001") {
			void this._manager.notify({ requiresRestart: true });
		} else if (apiMigrating === "CCMG-1002") {
			void this._manager.notify({ migrating: true });
		}
	}
}
