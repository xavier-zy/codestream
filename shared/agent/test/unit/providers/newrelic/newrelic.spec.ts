"use strict";

import { expect } from "chai";

require("mocha").describe;
require("mocha").it;
import { NewRelicProvider } from "../../../../src/providers/newrelic";

describe("NewRelicProvider", async () => {
	it("tryFormatStack", async () => {
		const data = {
			crash: null,
			entityType: "MOBILE_APPLICATION_ENTITY",
			exception: {
				stackTrace: {
					frames: [
						{
							filepath: "Logger.kt",
							formatted: "com.newrelic.common.Logger",
							line: 67,
							name: "wrapToBeTraceable"
						},
						{
							filepath: "Logger.kt",
							formatted: "com.newrelic.common.Logger",
							line: 28,
							name: "logError"
						},
						{
							filepath: "Logger.kt",
							formatted: "com.newrelic.common.Logger",
							line: 18,
							name: "logError$default"
						},
						{
							filepath: "RefreshTokenQuery.kt",
							formatted: "com.newrelic.login.api.query.RefreshTokenQuery",
							line: 62,
							name: "refreshToken"
						},
						{
							formatted: "com.newrelic.login.api.query.RefreshTokenQuery$refreshToken$1",
							line: 15,
							name: "invokeSuspend"
						},
						{
							filepath: "ContinuationImpl.kt",
							formatted: "kotlin.coroutines.jvm.internal.BaseContinuationImpl",
							line: 33,
							name: "resumeWith"
						},
						{
							filepath: "DispatchedTask.kt",
							formatted: "kotlinx.coroutines.DispatchedTask",
							line: 104,
							name: "run"
						},
						{
							filepath: "Handler.java",
							formatted: "android.os.Handler",
							line: 883,
							name: "handleCallback"
						},
						{
							filepath: "Handler.java",
							formatted: "android.os.Handler",
							line: 100,
							name: "dispatchMessage"
						},
						{
							filepath: "Looper.java",
							formatted: "android.os.Looper",
							line: 224,
							name: "loop"
						},
						{
							filepath: "ActivityThread.java",
							formatted: "android.app.ActivityThread",
							line: 7561,
							name: "main"
						},
						{
							filepath: "Method.java",
							formatted: "java.lang.reflect.Method",
							line: -2,
							name: "invoke"
						},
						{
							filepath: "RuntimeInit.java",
							formatted: "com.android.internal.os.RuntimeInit$MethodAndArgsCaller",
							line: 539,
							name: "run"
						},
						{
							filepath: "ZygoteInit.java",
							formatted: "com.android.internal.os.ZygoteInit",
							line: 995,
							name: "main"
						}
					]
				}
			},
			name: "Thing for Android - Production"
		};

		const results = new NewRelicProvider({} as any, {} as any).tryFormatStack(
			data.entityType,
			data.exception
		);

		expect(results?.stackTrace.frames.map(_ => _.formatted)).to.deep.equal([
			"com.newrelic.common.Logger(Logger.kt:67)",
			"com.newrelic.common.Logger(Logger.kt:28)",
			"com.newrelic.common.Logger(Logger.kt:18)",
			"com.newrelic.login.api.query.RefreshTokenQuery(RefreshTokenQuery.kt:62)",
			"com.newrelic.login.api.query.RefreshTokenQuery$refreshToken$1",
			"kotlin.coroutines.jvm.internal.BaseContinuationImpl(ContinuationImpl.kt:33)",
			"kotlinx.coroutines.DispatchedTask(DispatchedTask.kt:104)",
			"android.os.Handler(Handler.java:883)",
			"android.os.Handler(Handler.java:100)",
			"android.os.Looper(Looper.java:224)",
			"android.app.ActivityThread(ActivityThread.java:7561)",
			"java.lang.reflect.Method",
			"com.android.internal.os.RuntimeInit$MethodAndArgsCaller(RuntimeInit.java:539)",
			"com.android.internal.os.ZygoteInit(ZygoteInit.java:995)"
		]);
	});
});
