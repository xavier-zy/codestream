using System.ComponentModel.Composition;
using System.Threading;
using CodeStream.VisualStudio.Core.Events;
using Microsoft.VisualStudio.ComponentModelHost;
using Microsoft.VisualStudio.LiveShare;
using Microsoft.VisualStudio.Shell;

namespace CodeStream.VisualStudio.Services.LiveShare {
	/// <summary>
	/// See https://www.nuget.org/packages/Microsoft.VisualStudio.LiveShare/
	/// </summary>
	[ExportCollaborationService(typeof(ICollaborationHostService),
		Name = "CodeStreamLS",
		Scope = SessionScope.Host,
		Role = ServiceRole.RemoteService
	)]
	public class CollaborationHostServiceFactory : ICollaborationServiceFactory {
		private readonly IEventAggregator _eventAggregator;

		[ImportingConstructor]
		public CollaborationHostServiceFactory() {
			var componentModel = Package.GetGlobalService(typeof(SComponentModel)) as IComponentModel;
			_eventAggregator = componentModel?.GetService<IEventAggregator>();
		}

		public System.Threading.Tasks.Task<ICollaborationService> CreateServiceAsync(
			CollaborationSession collaborationSession, CancellationToken cancellationToken) {
			return System.Threading.Tasks.Task.FromResult<ICollaborationService>(new CollaborationHostService(collaborationSession, _eventAggregator));
		}
	}
}
