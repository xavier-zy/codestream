using CodeStream.VisualStudio.Core;
using Microsoft.VisualStudio.Shell;
using System;
using System.ComponentModel.Design;
using System.Runtime.InteropServices;

namespace CodeStream.VisualStudio.Packages {

	[Guid(Guids.CodeStreamSettingsPackageId)]
	public sealed partial class SettingsPackage : AsyncPackage, IServiceContainer { }
}
