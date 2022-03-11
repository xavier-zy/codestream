using CodeStream.VisualStudio.Core;
using Microsoft.VisualStudio.Shell;
using System;
using System.Runtime.InteropServices;

namespace CodeStream.VisualStudio.Packages {
	[Guid(Guids.ProtocolPackagePackageId)]
	public sealed partial class ProtocolPackage : AsyncPackage {
	}
}
