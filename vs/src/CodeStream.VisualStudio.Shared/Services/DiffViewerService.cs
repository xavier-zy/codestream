//using System;
//using System.Collections.Generic;
//using System.ComponentModel.Composition;
//using CodeStream.VisualStudio.Extensions;
//using Microsoft.VisualStudio.Editor;
//using Microsoft.VisualStudio.Shell;
//using Microsoft.VisualStudio.Text;
//using Microsoft.VisualStudio.Text.Differencing;
//using Microsoft.VisualStudio.Text.Editor;

//namespace CodeStream.VisualStudio.Services {
//	public interface IDiffViewerService {
//		object CreateDiffView(ITextBuffer buffer, Span span, string newContent);
//	}
//	[Export(typeof(IDiffViewerService))]
//	public class DiffViewerService : IDiffViewerService {
//		private readonly IWpfDifferenceViewerFactoryService _diffFactory;
//		private readonly IDifferenceBufferFactoryService _diffBufferFactory;
//		private readonly ITextBufferFactoryService _bufferFactory;
//		private readonly ITextViewRoleSet _previewRoleSet;

//		[ImportingConstructor]
//		public DiffViewerService(
//			[Import(typeof(SVsServiceProvider))]IServiceProvider serviceProvider,
//			IWpfDifferenceViewerFactoryService diffFactory,
//			IDifferenceBufferFactoryService diffBufferFactory,
//			ITextBufferFactoryService bufferFactory, ITextEditorFactoryService textEditorFactoryService) {
//			_diffFactory = diffFactory;
//			_diffBufferFactory = diffBufferFactory;
//			_bufferFactory = bufferFactory;
//			_previewRoleSet = textEditorFactoryService.CreateTextViewRoleSet(PredefinedTextViewRoles.Analyzable);
//		}

//		public object CreateDiffView(ITextBuffer buffer, Span span, string newContent) {
//			if (buffer == null || newContent.IsNullOrWhiteSpace()) {
//				return null;
//			}

//			var snapshot = buffer.CurrentSnapshot;

//			// Create a copy of the left hand buffer (we're going to remove all of the
//			// content we don't care about from it).
//			var leftBuffer = _bufferFactory.CreateTextBuffer(buffer.ContentType);
//			using (var edit = leftBuffer.CreateEdit()) {
//				edit.Insert(0, snapshot.GetText());
//				edit.Apply();
//			}

//			// create a buffer for the right hand side, copy the original buffer
//			// into it, and then apply the changes.
//			var rightBuffer = _bufferFactory.CreateTextBuffer(buffer.ContentType);
//			using (var edit = rightBuffer.CreateEdit()) {
//				edit.Insert(0, snapshot.GetText());
//				edit.Apply();
//			}

//			var startingVersion = rightBuffer.CurrentSnapshot;
//			rightBuffer.Replace(span, newContent);
//		//	VsProjectAnalyzer.ApplyChanges(changes, rightBuffer, new LocationTracker(startingVersion), startingVersion.Version.VersionNumber);

//			//var textChanges = startingVersion.Version.Changes;
//			//int minPos = startingVersion.Length, maxPos = 0;
//			//foreach (var change in textChanges) {
//			//	minPos = Math.Min(change.OldPosition, minPos);
//			//	maxPos = Math.Max(change.OldPosition, maxPos);
//			//}

//			//if (minPos == startingVersion.Length && maxPos == 0) {
//			//	// no changes?  that's weird...
//			//	return null;
//			//}

//		//	MinimizeBuffers(leftBuffer, rightBuffer, startingVersion, minPos, maxPos);

//			// create the difference buffer and view...
//			var diffBuffer = _diffBufferFactory.CreateDifferenceBuffer(leftBuffer, rightBuffer);
//			var diffView = _diffFactory.CreateDifferenceView(diffBuffer, _previewRoleSet);
//			diffView.ViewMode = DifferenceViewMode.SideBySide;
//			//diffView.InlineView.ZoomLevel *= .75;
//			diffView.InlineView.VisualElement.Focusable = false;
//			//diffView.InlineHost.GetTextViewMargin("deltadifferenceViewerOverview").VisualElement.Visibility = System.Windows.Visibility.Collapsed;

//			// Reduce the size of the buffer once it's ready
//			diffView.DifferenceBuffer.SnapshotDifferenceChanged += (sender, args) => {
//				diffView.InlineView.DisplayTextLineContainingBufferPosition(
//					new SnapshotPoint(diffView.DifferenceBuffer.CurrentInlineBufferSnapshot, 0),
//					0.0, ViewRelativePosition.Top, double.MaxValue, double.MaxValue
//				);

//				var width = Math.Max(diffView.InlineView.MaxTextRightCoordinate * (diffView.InlineView.ZoomLevel / 100), 400); // Width of the widest line.
//				var height = diffView.InlineView.LineHeight * (diffView.InlineView.ZoomLevel / 100) * // Height of each line.
//					diffView.DifferenceBuffer.CurrentInlineBufferSnapshot.LineCount;

//				diffView.VisualElement.Width = width;
//				diffView.VisualElement.Height = height;
//			};

//			return diffView.VisualElement;
//		}

//		private static void MinimizeBuffers(ITextBuffer leftBuffer, ITextBuffer rightBuffer, ITextSnapshot startingVersion, int minPos, int maxPos) {
//			// Remove the unchanged content from both buffers
//			using (var edit = leftBuffer.CreateEdit()) {
//				edit.Delete(0, minPos);
//				edit.Delete(Span.FromBounds(maxPos, startingVersion.Length));
//				edit.Apply();
//			}

//			using (var edit = rightBuffer.CreateEdit()) {
//				edit.Delete(
//					0,
//					Tracking.TrackPositionForwardInTime(
//						PointTrackingMode.Negative,
//						minPos,
//						startingVersion.Version,
//						rightBuffer.CurrentSnapshot.Version
//					)
//				);

//				edit.Delete(
//					Span.FromBounds(
//						Tracking.TrackPositionForwardInTime(
//							PointTrackingMode.Positive,
//							maxPos,
//							startingVersion.Version,
//							rightBuffer.CurrentSnapshot.Version
//						),
//						rightBuffer.CurrentSnapshot.Length
//					)
//				);
//				edit.Apply();
//			}
//		}
//	}
//}
