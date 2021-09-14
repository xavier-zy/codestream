"use strict";

import { expect } from "chai";
require("mocha").describe;
require("mocha").it;
import { Parser } from "../../../../src/managers/stackTraceParsers/javaStackTraceParser";

describe("javaStackTraceParser", () => {
	it("stack1", () => {
		const str = `javax.servlet.ServletException: Something bad happened
at com.example.myproject.OpenSessionInViewFilter.doFilter(OpenSessionInViewFilter.java:60)
at org.mortbay.jetty.servlet.ServletHandler$CachedChain.doFilter(ServletHandler.java:1157)
at com.example.myproject.ExceptionHandlerFilter.doFilter(ExceptionHandlerFilter.java:28)
at org.mortbay.jetty.servlet.ServletHandler$CachedChain.doFilter(ServletHandler.java:1157)
at com.example.myproject.OutputBufferFilter.doFilter(OutputBufferFilter.java:33)
at org.mortbay.jetty.servlet.ServletHandler$CachedChain.doFilter(ServletHandler.java:1157)
at org.mortbay.jetty.servlet.ServletHandler.handle(ServletHandler.java:388)
at org.mortbay.jetty.security.SecurityHandler.handle(SecurityHandler.java:216)
at org.mortbay.jetty.servlet.SessionHandler.handle(SessionHandler.java:182)
at org.mortbay.jetty.handler.ContextHandler.handle(ContextHandler.java:765)
at org.mortbay.jetty.webapp.WebAppContext.handle(WebAppContext.java:418)
at org.mortbay.jetty.handler.HandlerWrapper.handle(HandlerWrapper.java:152)
at org.mortbay.jetty.Server.handle(Server.java:326)
at org.mortbay.jetty.HttpConnection.handleRequest(HttpConnection.java:542)
at org.mortbay.jetty.HttpConnection$RequestHandler.content(HttpConnection.java:943)
at org.mortbay.jetty.HttpParser.parseNext(HttpParser.java:756)
at org.mortbay.jetty.HttpParser.parseAvailable(HttpParser.java:218)
at org.mortbay.jetty.HttpConnection.handle(HttpConnection.java:404)
at org.mortbay.jetty.bio.SocketConnector$Connection.run(SocketConnector.java:228)
at org.mortbay.thread.QueuedThreadPool$PoolThread.run(QueuedThreadPool.java:582)`;

		const result = Parser(str);

		expect(result).to.deep.equals({
			lines: [
				{
					method: "com.example.myproject.OpenSessionInViewFilter.doFilter",
					fileFullPath: "OpenSessionInViewFilter.java",
					line: 60
				},
				{
					method: "org.mortbay.jetty.servlet.ServletHandler$CachedChain.doFilter",
					fileFullPath: "ServletHandler.java",
					line: 1157
				},
				{
					method: "com.example.myproject.ExceptionHandlerFilter.doFilter",
					fileFullPath: "ExceptionHandlerFilter.java",
					line: 28
				},
				{
					method: "org.mortbay.jetty.servlet.ServletHandler$CachedChain.doFilter",
					fileFullPath: "ServletHandler.java",
					line: 1157
				},
				{
					method: "com.example.myproject.OutputBufferFilter.doFilter",
					fileFullPath: "OutputBufferFilter.java",
					line: 33
				},
				{
					method: "org.mortbay.jetty.servlet.ServletHandler$CachedChain.doFilter",
					fileFullPath: "ServletHandler.java",
					line: 1157
				},
				{
					method: "org.mortbay.jetty.servlet.ServletHandler.handle",
					fileFullPath: "ServletHandler.java",
					line: 388
				},
				{
					method: "org.mortbay.jetty.security.SecurityHandler.handle",
					fileFullPath: "SecurityHandler.java",
					line: 216
				},
				{
					method: "org.mortbay.jetty.servlet.SessionHandler.handle",
					fileFullPath: "SessionHandler.java",
					line: 182
				},
				{
					method: "org.mortbay.jetty.handler.ContextHandler.handle",
					fileFullPath: "ContextHandler.java",
					line: 765
				},
				{
					method: "org.mortbay.jetty.webapp.WebAppContext.handle",
					fileFullPath: "WebAppContext.java",
					line: 418
				},
				{
					method: "org.mortbay.jetty.handler.HandlerWrapper.handle",
					fileFullPath: "HandlerWrapper.java",
					line: 152
				},
				{
					method: "org.mortbay.jetty.Server.handle",
					fileFullPath: "Server.java",
					line: 326
				},
				{
					method: "org.mortbay.jetty.HttpConnection.handleRequest",
					fileFullPath: "HttpConnection.java",
					line: 542
				},
				{
					method: "org.mortbay.jetty.HttpConnection$RequestHandler.content",
					fileFullPath: "HttpConnection.java",
					line: 943
				},
				{
					method: "org.mortbay.jetty.HttpParser.parseNext",
					fileFullPath: "HttpParser.java",
					line: 756
				},
				{
					method: "org.mortbay.jetty.HttpParser.parseAvailable",
					fileFullPath: "HttpParser.java",
					line: 218
				},
				{
					method: "org.mortbay.jetty.HttpConnection.handle",
					fileFullPath: "HttpConnection.java",
					line: 404
				},
				{
					method: "org.mortbay.jetty.bio.SocketConnector$Connection.run",
					fileFullPath: "SocketConnector.java",
					line: 228
				},
				{
					method: "org.mortbay.thread.QueuedThreadPool$PoolThread.run",
					fileFullPath: "QueuedThreadPool.java",
					line: 582
				}
			],
			header: "javax.servlet.ServletException: Something bad happened",
			error: "Something bad happened"
		});
	});

	it("stack2", () => {
		const str = `\tjava.base/sun.nio.fs.UnixException.translateToIOException(UnixException.java:92)\n\tjava.base/sun.nio.fs.UnixException.rethrowAsIOException(UnixException.java:111)\n\tjava.base/sun.nio.fs.UnixException.rethrowAsIOException(UnixException.java:116)\n\tjava.base/sun.nio.fs.UnixFileSystemProvider.newByteChannel(UnixFileSystemProvider.java:219)\n\tjava.base/java.nio.file.Files.newByteChannel(Files.java:371)\n\tjava.base/java.nio.file.Files.newByteChannel(Files.java:422)\n\tjava.base/java.nio.file.Files.readAll…va.util.concurrent.Executors$RunnableAdapter.call(Executors.java:515)\n\tjava.base/java.util.concurrent.FutureTask.runAndReset(FutureTask.java:305)\n\tjava.base/java.util.concurrent.ScheduledThreadPoolExecutor$ScheduledFutureTask.run(ScheduledThreadPoolExecutor.java:305)\n\tjava.base/java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1128)\n\tjava.base/java.util.concurrent.ThreadPoolExecutor$Worker.run(ThreadPoolExecutor.java:628)\n\tjava.base/java.lang.Thread.run(Thread.java:834)`;
		const result = Parser(str);
		expect(result).to.deep.equals({
			lines: [
				{
					method: "java.base/sun.nio.fs.UnixException.translateToIOException",
					fileFullPath: "UnixException.java",
					line: 92
				},
				{
					fileFullPath: "UnixException.java",
					line: 111,
					method: "java.base/sun.nio.fs.UnixException.rethrowAsIOException"
				},
				{
					fileFullPath: "UnixException.java",
					line: 116,
					method: "java.base/sun.nio.fs.UnixException.rethrowAsIOException"
				},
				{
					fileFullPath: "UnixFileSystemProvider.java",
					line: 219,
					method: "java.base/sun.nio.fs.UnixFileSystemProvider.newByteChannel"
				},
				{
					fileFullPath: "Files.java",
					line: 371,
					method: "java.base/java.nio.file.Files.newByteChannel"
				},
				{
					fileFullPath: "Files.java",
					line: 422,
					method: "java.base/java.nio.file.Files.newByteChannel"
				},
				{
					fileFullPath: "FutureTask.java",
					line: 305,
					method: "java.base/java.util.concurrent.FutureTask.runAndReset"
				},
				{
					fileFullPath: "ScheduledThreadPoolExecutor.java",
					line: 305,
					method:
						"java.base/java.util.concurrent.ScheduledThreadPoolExecutor$ScheduledFutureTask.run"
				},
				{
					fileFullPath: "ThreadPoolExecutor.java",
					line: 1128,
					method: "java.base/java.util.concurrent.ThreadPoolExecutor.runWorker"
				},
				{
					fileFullPath: "ThreadPoolExecutor.java",
					line: 628,
					method: "java.base/java.util.concurrent.ThreadPoolExecutor$Worker.run"
				},
				{
					fileFullPath: "Thread.java",
					line: 834,
					method: "java.base/java.lang.Thread.run"
				}
			]
		});
	});
});
