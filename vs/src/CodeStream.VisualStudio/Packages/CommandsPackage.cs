using CodeStream.VisualStudio.Commands;
using CodeStream.VisualStudio.Core.Events;
using CodeStream.VisualStudio.Core.Extensions;
using CodeStream.VisualStudio.Core.Logging;
using CodeStream.VisualStudio.Core.Packages;
using CodeStream.VisualStudio.Core.Services;
using CodeStream.VisualStudio.Core.Vssdk.Commands;
using CodeStream.VisualStudio.UI;
using Microsoft.VisualStudio;
using Microsoft.VisualStudio.ComponentModelHost;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;
using Serilog;
using System;
using System.Collections.Generic;
using System.ComponentModel.Design;
using System.Runtime.InteropServices;
using System.Threading;
using CodeStream.VisualStudio.Core;
using Task = System.Threading.Tasks.Task;

namespace CodeStream.VisualStudio.Packages {
 
	[Guid(PackageGuids.guidCodeStreamPackageString)]
 
	// ReSharper disable once RedundantExtendsListEntry
	public sealed partial class CommandsPackage : AsyncPackage, IServiceContainer, IToolWindowProvider, SToolWindowProvider {
		 
	}
}
