//using System;
//using System.Collections.Generic;
//using System.Collections.ObjectModel;
//using System.ComponentModel.Composition;
//using System.Runtime.CompilerServices;
//using CodeStream.VisualStudio.Core;
//using Microsoft.VisualStudio.Text;
//using Microsoft.VisualStudio.Text.Editor;
//using Microsoft.VisualStudio.Utilities;

//namespace CodeStream.VisualStudio.UI {
//	[Export(typeof(IWpfTextViewConnectionListener))]
//	[ContentType(ContentTypes.Text)]
//	[TextViewRole("DIFF")]
//	[TextViewRole(PredefinedTextViewRoles.Interactive)]
//	[TextViewRole(PredefinedTextViewRoles.Document)]
//	[TextViewRole(PredefinedTextViewRoles.PrimaryDocument)]
//	[TextViewRole(PredefinedTextViewRoles.Editable)]
//	class DiffViewCreationListener : IWpfTextViewConnectionListener {

//		private static readonly object WeakTableLock = new object();
//		public static readonly ConditionalWeakTable<ITextBuffer, HashSet<IWpfTextView>> TextBufferTable =
//			new ConditionalWeakTable<ITextBuffer, HashSet<IWpfTextView>>();

//		public void SubjectBuffersConnected(IWpfTextView wpfTextView, ConnectionReason reason, Collection<ITextBuffer> subjectBuffers) {
//			lock (WeakTableLock) {
//				foreach (var buffer in subjectBuffers) {
//					if (!TextBufferTable.TryGetValue(buffer, out HashSet<IWpfTextView> textViews)) {
//						textViews = new HashSet<IWpfTextView>();
//						TextBufferTable.Add(buffer, textViews);
//					}

//					textViews.Add(wpfTextView);
//				}
//			}
//		}

//		public void SubjectBuffersDisconnected(IWpfTextView wpfTextView, ConnectionReason reason, Collection<ITextBuffer> subjectBuffers) {
//			lock (WeakTableLock) {
//				foreach (var buffer in subjectBuffers) {
//					if (TextBufferTable.TryGetValue(buffer, out HashSet<IWpfTextView> textViews)) {
//						textViews.Remove(wpfTextView);
//						if (textViews.Count == 0) {
//							TextBufferTable.Remove(buffer);
//						}
//					}
//				}
//			}
//		}
//	}
//}
