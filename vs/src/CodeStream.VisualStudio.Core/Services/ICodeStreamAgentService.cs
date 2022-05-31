﻿using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using CodeStream.VisualStudio.Core.Models;
using Newtonsoft.Json.Linq;
using StreamJsonRpc;

namespace CodeStream.VisualStudio.Core.Services {
	public interface ICodeStreamAgentService {
		Task SetRpcAsync(JsonRpc rpc);
		Task<T> SendAsync<T>(string name, object arguments, CancellationToken? cancellationToken = null);
		Task<JToken> ReinitializeAsync(string newServerUrl = null);
		Task<CreateDocumentMarkerPermalinkResponse> CreatePermalinkAsync(Range range, string uri, string privacy);
		Task<CreatePostResponse> CreatePostAsync(string streamId, string threadId, string text);
		Task<GetFileStreamResponse> GetFileStreamAsync(Uri uri);
		Task<GetPostResponse> GetPostAsync(string streamId, string postId);
		Task<GetUserResponse> GetUserAsync(string userId);
		Task<GetStreamResponse> GetStreamAsync(string streamId);
		Task<CsDirectStream> CreateDirectStreamAsync(List<string> memberIds);
		Task<JToken> LoginViaTokenAsync(JToken token, string teamId = null);
		Task<JToken> OtcLoginRequestAsync(OtcLoginRequest request);
		Task<JToken> LoginAsync(string email, string password, string serverUrl, string teamId);
		Task<JToken> LogoutAsync(string newServerUrl = null);
		Task<JToken> GetBootstrapAsync(Settings settings, JToken state = null, bool isAuthenticated = false);
		Task<FetchCodemarksResponse> GetMarkersAsync(string streamId);
		Task<DocumentFromMarkerResponse> GetDocumentFromMarkerAsync(DocumentFromMarkerRequest request);
		Task<DocumentMarkersResponse> GetMarkersForDocumentAsync(Uri uri, CancellationToken? cancellationToken = null);
		Task<FetchStreamsResponse> FetchStreamsAsync(FetchStreamsRequest request);
		Task TrackAsync(string key, TelemetryProperties properties = null);
		Task SetServerUrlAsync(string serverUrl, bool? disableStrictSSL, string environment = null);

		Task<GetReviewContentsResponse> GetReviewContentsAsync(string reviewId, int? checkpoint, string repoId,
			string path);

		Task<GetReviewContentsLocalResponse> GetReviewContentsLocalAsync(
			string repoId,
			string path,
			string editingReviewId,
			string baseSha,
			string rightVersion);

		Task<GetReviewResponse> GetReviewAsync(string reviewId);

		Task<GetFileLevelTelemetryResponse> GetFileLevelTelemetryAsync(
			string filePath,
			string languageId,
			bool resetCache,
			string codeNamespace,
			string functionName,
			bool includeThroughput,
			bool includeAverageDuration,
			bool includeErrorRate);

		Task<GetMethodLevelTelemetryResponse> GetMethodLevelTelemetryAsync(
			string repoId,
			string newRelicEntityGuid,
			string duration,
			string throughput,
			string errorRate);
	}
}
