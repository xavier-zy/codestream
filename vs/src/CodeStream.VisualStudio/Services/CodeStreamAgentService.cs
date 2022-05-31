﻿using CodeStream.VisualStudio.Core.Logging;
using Microsoft.VisualStudio.Shell;
using Newtonsoft.Json.Linq;
using Serilog;
using StreamJsonRpc;
using System;
using System.Collections.Generic;
using System.ComponentModel.Composition;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CodeStream.VisualStudio.Core;
using CodeStream.VisualStudio.Core.Events;
using CodeStream.VisualStudio.Core.Extensions;
using Microsoft.VisualStudio.ComponentModelHost;
using Task = System.Threading.Tasks.Task;
using TextDocumentIdentifier = CodeStream.VisualStudio.Core.Models.TextDocumentIdentifier;
using CodeStream.VisualStudio.Core.Models;
using CodeStream.VisualStudio.Core.Services;
#if DEBUG
using TraceLevel = CodeStream.VisualStudio.Core.Logging.TraceLevel;
#endif
// ReSharper disable ClassNeverInstantiated.Global
// ReSharper disable UnusedAutoPropertyAccessor.Global

namespace CodeStream.VisualStudio.Services {
	[Export(typeof(ICodeStreamAgentService))]
	[PartCreationPolicy(CreationPolicy.Shared)]
	public class CodeStreamAgentService : ICodeStreamAgentService, IDisposable {
		private static readonly ILogger Log = LogManager.ForContext<CodeStreamAgentService>();
		private readonly ISessionService _sessionService;
		private readonly IEventAggregator _eventAggregator;
		private readonly ISettingsServiceFactory _settingsServiceFactory;
		private readonly IHttpClientService _httpClientService;

		[ImportingConstructor]
		public CodeStreamAgentService(
			IEventAggregator eventAggregator,
			ISessionService sessionService,
			ISettingsServiceFactory settingsServiceFactory,
			IHttpClientService httpClientService) {
			_eventAggregator = eventAggregator;
			_sessionService = sessionService;
			_settingsServiceFactory = settingsServiceFactory;
			_httpClientService = httpClientService;
			try {
				if (_eventAggregator == null || _sessionService == null || settingsServiceFactory == null) {
					Log.Error($"_eventAggregatorIsNull={_eventAggregator == null},_sessionServiceIsNull={_sessionService == null},settingsServiceFactoryIsNull={settingsServiceFactory == null}");
				}
			}
			catch (Exception ex) {
				Log.Fatal(ex, nameof(CodeStreamAgentService));
			}
		}

		private JsonRpc _rpc;
		bool _disposed;

		public async Task SetRpcAsync(JsonRpc rpc) {
			Log.Debug(nameof(SetRpcAsync));
			_rpc = rpc;

			try {
				var initializationResult = await InitializeAsync();
				Log.Verbose(initializationResult?.ToString());
				_sessionService.SetAgentConnected();
			}
			catch (Exception ex) {
				Log.Fatal(ex, nameof(SetRpcAsync));
				throw;
			}

			await System.Threading.Tasks.Task.CompletedTask;
		}

		private Task<T> SendCoreAsync<T>(string name, object arguments, CancellationToken? cancellationToken = null) {
			cancellationToken = cancellationToken ?? CancellationToken.None;
			try {
				// the arguments might have sensitive data in it -- don't include arguments here
				using (Log.CriticalOperation($"name=REQ,Method={name}")) {
					return _rpc.InvokeWithParameterObjectAsync<T>(name, arguments, cancellationToken.Value);
				}
			}
			catch (ObjectDisposedException ex) {
				Log.Fatal(ex, "SendName={Name}", name);
#if DEBUG
				Log.Verbose($"Arguments={(arguments != null ? arguments.ToJson(true) : null)}");
#endif
				throw;
			}
			catch (Exception ex) {
				Log.Fatal(ex, "SendName={Name}", name);
				throw;
			}
		}

		public Task<T> SendAsync<T>(string name, object arguments, CancellationToken? cancellationToken = null) {
			if (!_sessionService.IsAgentReady) {
				if (Log.IsDebugEnabled()) {
					try {
#if DEBUG
						Log.Warning($"Agent not ready. Status={_sessionService.StateString} Name={name}, Arguments={arguments?.ToJson()}");
#else
						Log.Warning($"Agent not ready. Status={_sessionService.StateString} Name={name}");
#endif
					}
					catch (Exception ex) {
						Log.Warning(ex, nameof(SendAsync));
					}
				}

				return Task.FromResult(default(T));
			}

			return SendCoreAsync<T>(name, arguments, cancellationToken);
		}

		public Task<JToken> ReinitializeAsync(string newServerUrl = null) {
			var isAgentReady = _sessionService.IsAgentReady;
			Log.Debug($"{nameof(ReinitializeAsync)} IsAgentReady={isAgentReady}");

			if (!isAgentReady) return Task.FromResult((JToken)null);

			return InitializeAsync(newServerUrl);
		}

		private Task<JToken> InitializeAsync(string newServerUrl = null) {
			Log.Debug($"{nameof(InitializeAsync)}");

			var settingsManager = _settingsServiceFactory.GetOrCreate(nameof(CodeStreamAgentService));
			var extensionInfo = settingsManager.GetExtensionInfo();
			var ideInfo = settingsManager.GetIdeInfo();
			var nrSettings = _httpClientService.GetNREnvironmentSettings();

			return SendCoreAsync<JToken>("codestream/onInitialized", new LoginRequest {
				ServerUrl = newServerUrl ?? settingsManager.ServerUrl,
				Extension = extensionInfo,
				Ide = ideInfo,
				Proxy = settingsManager.Proxy,
				ProxySupport = settingsManager.Proxy?.Url?.IsNullOrWhiteSpace() == false ? "override" : settingsManager.ProxySupport.ToJsonValue(),
				DisableStrictSSL = settingsManager.DisableStrictSSL,
				NewRelicTelemetryEnabled = nrSettings.HasValidSettings,
#if DEBUG
				TraceLevel = TraceLevel.Verbose.ToJsonValue(),
				IsDebugging = true
#else
                TraceLevel = settingsManager.GetAgentTraceLevel().ToJsonValue()
#endif

			});
		}

		public Task<CreateDocumentMarkerPermalinkResponse> CreatePermalinkAsync(Range range, string uri, string privacy) {
			return SendAsync<CreateDocumentMarkerPermalinkResponse>(CreateDocumentMarkerPermalinkRequestType.MethodName, new CreateDocumentMarkerPermalinkRequest {
				Range = range,
				Uri = uri,
				Privacy = privacy
			});
		}

		public Task<FetchCodemarksResponse> GetMarkersAsync(string streamId) {
			return SendAsync<FetchCodemarksResponse>("codestream/fetchCodemarks", new FetchCodemarksRequest { StreamId = streamId });
		}

		public Task<DocumentMarkersResponse> GetMarkersForDocumentAsync(Uri uri, CancellationToken? cancellationToken = null) {			 
			return SendAsync<DocumentMarkersResponse>("codestream/textDocument/markers", new DocumentMarkersRequest {
				TextDocument = new TextDocumentIdentifier { Uri = uri.ToString() },
				ApplyFilters = true
			}, cancellationToken);
		}

		public Task<GetFileStreamResponse> GetFileStreamAsync(Uri uri) {
			return SendAsync<GetFileStreamResponse>("codestream/streams/fileStream", new GetFileStreamRequest {
				TextDocument = new TextDocumentIdentifier { Uri = uri.ToString() }
			});
		}

		public Task<GetPostResponse> GetPostAsync(string streamId, string postId) {
			return SendAsync<GetPostResponse>("codestream/post", new GetPostRequest {
				StreamId = streamId,
				PostId = postId
			});
		}

		public Task<GetStreamResponse> GetStreamAsync(string streamId) {
			return SendAsync<GetStreamResponse>("codestream/stream", new GetStreamRequest {
				StreamId = streamId
			});
		}

		public Task<GetUserResponse> GetUserAsync(string userId) {
			return SendAsync<GetUserResponse>("codestream/user", new GetUserRequest {
				UserId = userId
			});
		}

		public Task<CreatePostResponse> CreatePostAsync(string streamId, string threadId, string text) {
			return SendAsync<CreatePostResponse>("codestream/posts/create", new CreatePostRequest {
				StreamId = streamId,
				ParentPostId = threadId,
				Text = text
			});
		}

		public Task<CsDirectStream> CreateDirectStreamAsync(List<string> memberIds) {
			return SendAsync<CsDirectStream>("codestream/streams/createDirect", new CreateDirectStreamRequest {
				Type = StreamType.direct.ToString(),
				MemberIds = memberIds
			});
		}

		public Task<FetchStreamsResponse> FetchStreamsAsync(FetchStreamsRequest request) {
			return SendAsync<FetchStreamsResponse>("codestream/streams", new FetchStreamsRequest2 {
				Types = request.Types.Select(_ => _.ToString()).ToList(),
				MemberIds = request.MemberIds
			});
		}

		public Task TrackAsync(string eventName, TelemetryProperties properties) {
			try {
				return SendAsync<JToken>("codestream/telemetry", new TelemetryRequest {
					EventName = eventName,
					Properties = properties
				});
			}
			catch (Exception ex) {
				Log.Verbose(ex, $"Failed to send telemetry for {eventName}");
				return Task.CompletedTask;
			}
		}

		public Task<JToken> LoginViaTokenAsync(JToken token, string teamId = null) {
			return SendCoreAsync<JToken>("codestream/login/token", new TokenLoginRequest {
				Token = token,
				TeamId = teamId
			});
		}

		public Task<JToken> LoginAsync(string email, string password, string serverUrl, string teamId) {
			return SendCoreAsync<JToken>(PasswordLoginRequestType.MethodName, new PasswordLoginRequest {
				Email = email,
				Password = password,
				TeamId = teamId
			});
		}

		public Task<JToken> OtcLoginRequestAsync(OtcLoginRequest request) {
			return SendCoreAsync<JToken>("codestream/login/otc", request);
		}

		public async Task<JToken> LogoutAsync(string newServerUrl = null) {
			var response = await SendAsync<JToken>("codestream/logout", new LogoutRequest());
			await ReinitializeAsync(newServerUrl);
			return response;
		}

		public Task<DocumentFromMarkerResponse> GetDocumentFromMarkerAsync(DocumentFromMarkerRequest request) {
			return SendAsync<DocumentFromMarkerResponse>("codestream/textDocument/fromMarker", request);
		}

		public async Task<JToken> GetBootstrapAsync(Settings settings, JToken state = null, bool isAuthenticated = false) {
			using (Log.CriticalOperation(nameof(GetBootstrapAsync), Serilog.Events.LogEventLevel.Debug)) {
				var componentModel = Package.GetGlobalService(typeof(SComponentModel)) as IComponentModel;
				var settingsManager = _settingsServiceFactory.GetOrCreate(nameof(GetBootstrapAsync));
				// NOTE: this camelCaseSerializer is important because FromObject doesn't
				// serialize using the global camelCase resolver

				var capabilities = state?["capabilities"] != null
					? state["capabilities"].ToObject<JObject>()
					: JObject.FromObject(new { });
				capabilities.Merge(new Capabilities {
					CodemarkApply = true,
					CodemarkCompare = true,
					EditorTrackVisibleRange = true,
					Services = new Core.Models.Services { }
				}.ToJToken(), new JsonMergeSettings {
					MergeArrayHandling = MergeArrayHandling.Union
				});

				// TODO: Need to separate the agent caps from the IDE ones, so that we don't need to keep the model up to date (i.e. support agent passthrough)
				var capabilitiesObject = capabilities.ToObject<Capabilities>();

				var webViewUserSettingsService = componentModel.GetService<IWebviewUserSettingsService>();
				WebviewContext webviewContext;

				if (!isAuthenticated) {
					var userSettings =
						webViewUserSettingsService?.TryGetWebviewContext(_sessionService.SolutionName);

					if (userSettings != null) {
						webviewContext = userSettings;
					}
					else {
						webviewContext = new WebviewContext {
							HasFocus = true
						};
					}

					if (webviewContext.__teamless__ == null || webviewContext.__teamless__.SelectedRegion.IsNullOrWhiteSpace()) {
						// not authed, try to find the first selectedRegion (usually US) (somewhat stolen from store/session/actions)
						webviewContext.__teamless__ = new TeamlessContext() {
							SelectedRegion = settingsManager.GetCodeStreamEnvironmentInfo?.EnvironmentHosts?
								.Where(_ => _.ShortName.ToLower().Contains("us")).Select(_ => _.ShortName)
								.FirstOrDefault()
						};
						if (webviewContext.__teamless__.SelectedRegion.IsNullOrWhiteSpace()) {
							// fallback to first if we can't find a match above
							webviewContext.__teamless__.SelectedRegion = settingsManager.GetCodeStreamEnvironmentInfo
								?.EnvironmentHosts?.Select(_ => _.ShortName).FirstOrDefault();
						}
					}

					var bootstrapAnonymous = new BootstrapPartialResponseAnonymous {
						Capabilities = capabilitiesObject,
						Configs = new Configs {
							Email = settingsManager.Email,
							ShowAvatars = settingsManager.ShowAvatars,
							ServerUrl = settingsManager.ServerUrl,
							TraceLevel = settingsManager.GetAgentTraceLevel()
						},
						EnvironmentInfo = settingsManager.GetCodeStreamEnvironmentInfo,
						Version = settingsManager.GetEnvironmentVersionFormatted(),
						Context = webviewContext,
						Session = new UserSession() { },
						Ide = new Ide() {
							Name = Application.IdeMoniker
						}
					}.ToJToken();
#if DEBUG
					Log.Debug(bootstrapAnonymous?.ToString());
#endif
					return bootstrapAnonymous;
				}
				else {

					if (state == null) throw new ArgumentNullException(nameof(state));
					var bootstrapAuthenticated = await _rpc
						.InvokeWithParameterObjectAsync<JToken>(BootstrapRequestType.MethodName)
						.ConfigureAwait(false) as JObject;

					var editorService = componentModel?.GetService<IEditorService>();
					var editorContext = editorService?.GetEditorContext();

 					var teamId = state["teamId"].ToString();
					_sessionService.TeamId = teamId;
					var userSettings =
						webViewUserSettingsService?.TryGetWebviewContext(_sessionService.SolutionName, teamId);
					if (userSettings != null) {
						webviewContext = userSettings;
					}
					else {
						webviewContext = new WebviewContext {
							HasFocus = true
						};
					}

					webviewContext.CurrentTeamId = teamId;
					if (!webviewContext.PanelStack.AnySafe()) {
						webviewContext.PanelStack = new List<string> {WebviewPanels.CodemarksForFile};
					}
					var bootstrapResponse = new BootstrapAuthenticatedResponse {
						Capabilities = capabilitiesObject,
						Configs = new Configs {
							Email = (string)state["email"],
							ShowAvatars = settings.Options.ShowAvatars,
							ServerUrl = settings.Options.ServerUrl,
							TraceLevel = settingsManager.GetAgentTraceLevel()
						},
						Context = webviewContext,
						EditorContext = editorContext,
						Session = new UserSession {
							UserId = state["userId"].ToString()
						},
						EnvironmentInfo = settingsManager.GetCodeStreamEnvironmentInfo,
						Version = settingsManager.GetEnvironmentVersionFormatted(),
						Ide = new Ide() {
							Name = Application.IdeMoniker
						}
					};

					var bootstrapResponseJson = bootstrapResponse.ToJToken();
					bootstrapAuthenticated?.Merge(bootstrapResponseJson);
#if DEBUG
					// only log the non-user bootstrap data -- it's too verbose
					if (bootstrapAuthenticated == null) {
						System.Diagnostics.Debugger.Break();
					}
					Log.Debug(bootstrapResponseJson?.ToString());
#endif
					return bootstrapAuthenticated;
				}
			}
		}

		public void Dispose() {
			Dispose(true);
			GC.SuppressFinalize(this);
		}

		private void Dispose(bool disposing) {
			if (_disposed)
				return;


			_disposed = true;
		}

		public Task SetServerUrlAsync(string serverUrl, bool? disableStrictSSL, string environment = null) {
			return SendCoreAsync<JToken>(SetServerUrlRequestType.MethodName, new SetServerUrlRequest(serverUrl, disableStrictSSL, environment));
		}

		public Task<GetReviewContentsResponse> GetReviewContentsAsync(string reviewId, int? checkpoint, string repoId, string path) {
			return SendCoreAsync<GetReviewContentsResponse>(GetReviewContentsRequestType.MethodName, new GetReviewContentsRequest() {
				ReviewId = reviewId,
				Checkpoint = checkpoint,
				RepoId = repoId,
				Path = path
			});
		}

		public Task<GetReviewContentsLocalResponse> GetReviewContentsLocalAsync(
			string repoId,
			string path,
			string editingReviewId,
			string baseSha,
			string rightVersion) {
			return SendCoreAsync<GetReviewContentsLocalResponse>(GetReviewContentsLocalRequestType.MethodName,
				new GetReviewContentsLocalRequest() {
					RepoId = repoId,
					Path = path,
					EditingReviewId = editingReviewId,
					BaseSha = baseSha,
					RightVersion = rightVersion
				});
		}

		public Task<GetReviewResponse> GetReviewAsync(string reviewId) {
			return SendCoreAsync<GetReviewResponse>(GetReviewRequestType.MethodName, new GetReviewRequest() {
				ReviewId = reviewId
			});
		}

		public Task<GetFileLevelTelemetryResponse> GetFileLevelTelemetryAsync(
			string filePath,
			string languageId,
			bool resetCache,
			string codeNamespace,
			string functionName,
			bool includeThroughput,
			bool includeAverageDuration,
			bool includeErrorRate) {

			return SendCoreAsync<GetFileLevelTelemetryResponse>(GetFileLevelTelemetryRequestType.MethodName,
				new GetFileLevelTelemetryRequest {
					FilePath = filePath,
					LanguageId = languageId,
					ResetCache = resetCache,
					Locator = new FileLevelTelemetryFunctionLocator {
						FunctionName = functionName,
						Namespace = codeNamespace
					},
					Options = new FileLevelTelemetryRequestOptions {
						IncludeAverageDuration = includeAverageDuration,
						IncludeErrorRate = includeErrorRate,
						IncludeThroughput = includeThroughput
					}
				});
		}


		public Task<GetMethodLevelTelemetryResponse> GetMethodLevelTelemetryAsync(
			string repoId,
			string newRelicEntityGuid,
			string duration,
			string throughput,
			string errorRate) {

			return SendCoreAsync<GetMethodLevelTelemetryResponse>(GetMethodLevelTelemetryRequestType.MethodName,
				new GetMethodLevelTelemetryRequest {
					RepoId = repoId,
					NewRelicEntityGuid = newRelicEntityGuid,
					MetricTimesliceNameMapping = new MetricTimesliceNameMapping {
						Duration = duration,
						Throughput = throughput,
						Error = errorRate
					}
				});
		}
	}
}
