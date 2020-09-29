"use strict";
const webpack = require("webpack");
const fs = require("fs");
const path = require("path");
const CleanPlugin = require("clean-webpack-plugin");
const ForkTsCheckerPlugin = require("fork-ts-checker-webpack-plugin");
const FileManagerPlugin = require("filemanager-webpack-plugin");
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin");
const HtmlPlugin = require("html-webpack-plugin");
const BundleAnalyzerPlugin = require("webpack-bundle-analyzer").BundleAnalyzerPlugin;
const TerserPlugin = require("terser-webpack-plugin");

module.exports = function(env, argv) {
	env = env || {};
	env.analyzeBundle = Boolean(env.analyzeBundle);
	env.analyzeBundleWebview = Boolean(env.analyzeBundleWebview);

	env.production = env.analyzeBundle || env.analyzeBundleWebview || Boolean(env.production);
	env.reset = Boolean(env.reset);
	env.watch = Boolean(argv.watch || argv.w);

	let protocolPath = path.resolve(__dirname, "lib/protocols");
	if (!fs.existsSync(protocolPath)) {
		fs.mkdirSync(protocolPath);
	}

	console.log("Ensuring extension symlink to the agent protocol folder...");
	createFolderSymlinkSync(
		path.resolve(__dirname, "../shared/agent/src/protocol"),
		path.resolve(protocolPath, "agent"),
		env
	);

	console.log("Ensuring extension symlink to the webview protocol folder...");
	createFolderSymlinkSync(
		path.resolve(__dirname, "../shared/ui/ipc"),
		path.resolve(protocolPath, "webview"),
		env
	);

	console.log("Ensuring webview symlink to the agent protocol folder...");
	const protocolPathForWebview = path.resolve(__dirname, "../shared/ui/protocols");
	if (!fs.existsSync(protocolPathForWebview)) {
		fs.mkdirSync(protocolPathForWebview);
	}
	createFolderSymlinkSync(
		path.resolve(__dirname, "../shared/agent/src/protocol"),
		path.resolve(protocolPathForWebview, "agent"),
		env
	);

	return [getExtensionConfig(env), getWebviewConfig(env)];
};

function getExtensionConfig(env) {
	let clean = ["dist/agent*", "dist/codestream*"];

	const plugins = [
		new CleanPlugin(clean, { verbose: false }),
		new FileManagerPlugin({
			onEnd: [
				{
					copy: [
						{
							// TODO: Use environment variable if exists
							source: path.resolve(__dirname, "../shared/agent/dist"),
							destination: "dist/agent"
						},
						// {
						// 	source: path.resolve(__dirname, "codestream-*.info"),
						// 	destination: "dist/",
						// },
						{
							source: path.resolve(__dirname, "../shared/ui/assets/icons"),
							destination: "dist/icons"
						}
					]
				}
			]
		})
	];

	if (env.analyzeBundle) {
		plugins.push(new BundleAnalyzerPlugin());
	}

	if (env.production) {
		plugins.push(
			new TerserPlugin({
				cache: true,
				parallel: true,
				sourceMap: true,
				terserOptions: {
					ecma: 8,
					// Keep the class names otherwise @log won't provide a useful name
					keep_classnames: true,
					module: true,
					compress: {
						pure_funcs: ["console.warn"]
					}
				}
			})
		);
	}

	return {
		name: "extension",
		entry: "./lib/codestream.ts",
		mode: env.production ? "production" : "development",
		target: "node",
		devtool: "source-map",
		output: {
			libraryTarget: "commonjs2",
			libraryExport: "default",
			filename: "codestream.js",
			devtoolModuleFilenameTemplate: "file:///[absolute-resource-path]"
		},
		optimization: {
			minimizer: [
				new TerserPlugin({
					cache: true,
					parallel: true,
					sourceMap: !env.production,
					terserOptions: {
						ecma: 8,
						// Keep the class names otherwise @log won't provide a useful name
						keep_classnames: true,
						module: true
					}
				})
			],
			usedExports: true
		},
		resolve: {
			extensions: [".ts", ".tsx", ".js", ".jsx"],
			plugins: [new TsconfigPathsPlugin()],
			// Treats symlinks as real files -- using their "current" path
			symlinks: false
		},
		externals: [{ atom: "atom", electron: "electron" }],
		module: {
			rules: [
				{
					test: /\.ts$/,
					enforce: "pre",
					loader: "eslint-loader",
					exclude: /node_modules/,
					options: { fix: true }
				},
				{
					test: /\.tsx?$/,
					use: "ts-loader",
					exclude: /node_modules|\.d\.ts$/
				}
			]
		},
		plugins: plugins,
		stats: {
			all: false,
			assets: true,
			builtAt: true,
			env: true,
			errors: true,
			timings: true,
			warnings: true
		}
	};
}

function getWebviewConfig(env) {
	const context = path.resolve(__dirname, "webview-lib");

	const plugins = [
		new CleanPlugin([
			"dist/webview/*.{js,html}",
			"dist/webview/node_modules",
			"dist/webview/styles"
		]),
		new webpack.DefinePlugin(
			Object.assign(env.production ? { "process.env.NODE_ENV": JSON.stringify("production") } : {})
		),
		new FileManagerPlugin({
			onStart: [
				{
					copy: [
						{
							source: path.resolve(__dirname, "webview-lib/webview.less"),
							destination: "dist/webview/styles/"
						},
						{
							source: path.resolve(__dirname, "../shared/ui/styles/*"),
							destination: "dist/webview/styles/"
						},
						{
							source: path.resolve(
								__dirname,
								"../shared/ui/node_modules/rc-tooltip/assets/bootstrap.css"
							),
							destination: "dist/webview/node_modules/rc-tooltip/assets/bootstrap.css"
						},
						{
							source: path.resolve(
								__dirname,
								"../shared/ui/node_modules/emoji-mart/css/emoji-mart.css"
							),
							destination: "dist/webview/node_modules/emoji-mart/css/emoji-mart.css"
						},
						{
							source: path.resolve(__dirname, "../shared/ui/assets/icons"),
							destination: "dist/icons"
						}
					]
				}
			],
			onEnd: [
				{
					copy: [
						{
							source: path.resolve(__dirname, "webview-lib/preload.js"),
							destination: "dist/webview/"
						}
					]
				}
			]
		}),
		new HtmlPlugin({
			template: "index.html",
			filename: path.resolve(__dirname, "dist/webview/index.html"),
			inject: true,
			minify: env.production
				? {
						removeComments: true,
						collapseWhitespace: true,
						removeRedundantAttributes: true,
						useShortDoctype: true,
						removeEmptyAttributes: true,
						removeStyleLinkTypeAttributes: true,
						keepClosingSlash: true
				  }
				: false
		}),
		new ForkTsCheckerPlugin({
			async: false,
			useTypescriptIncrementalApi: false
		})
	];

	if (env.analyzeBundleWebview) {
		plugins.push(new BundleAnalyzerPlugin());
	}

	return {
		name: "webview",
		context: context,
		entry: {
			webview: "./index.ts"
		},
		node: false,
		mode: env.production ? "production" : "development",
		devtool: !env.production ? "eval-source-map" : undefined,
		output: {
			filename: "[name].js",
			path: path.resolve(__dirname, "dist/webview"),
			publicPath: "{{root}}/dist/webview/"
		},
		optimization: {
			minimizer: [
				new TerserPlugin({
					cache: true,
					parallel: true,
					sourceMap: !env.production,
					terserOptions: {
						ecma: 8
					}
				})
			],
			splitChunks: {
				cacheGroups: {
					default: false,
					data: {
						chunks: "all",
						filename: "webview-data.js",
						test: /\.json/
					}
				}
			}
		},
		module: {
			rules: [
				{
					test: /\.html$/,
					use: "html-loader",
					exclude: /node_modules/
				},
				{
					test: /\.(js|ts)x?$/,
					use: {
						loader: "babel-loader",
						options: {
							plugins: ["babel-plugin-styled-components"]
						}
					},
					exclude: /node_modules/
				}
			]
		},
		resolve: {
			extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
			modules: [context, "node_modules"],
			plugins: [
				new TsconfigPathsPlugin({
					configFile: path.resolve(context, "tsconfig.json")
				})
			],
			// Treats symlinks as real files -- using their "current" path
			symlinks: false
		},
		plugins: plugins,
		stats: {
			all: false,
			assets: true,
			builtAt: true,
			env: true,
			errors: true,
			timings: true,
			warnings: true
		}
	};
}

function createFolderSymlinkSync(source, target, env) {
	if (env.reset) {
		console.log("Unlinking symlink...");
		try {
			fs.unlinkSync(target);
		} catch (ex) {}
	} else if (fs.existsSync(target)) {
		return;
	}

	console.log("Creating symlink...");
	try {
		fs.symlinkSync(source, target, "dir");
	} catch (ex) {
		try {
			fs.unlinkSync(target);
			fs.symlinkSync(source, target, "dir");
		} catch (ex) {
			console.log(`Symlink creation failed; ${ex}`);
		}
	}
}
