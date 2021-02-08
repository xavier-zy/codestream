using CodeStream.VisualStudio.Core.Extensions;
using CodeStream.VisualStudio.Core.Models;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace CodeStream.VisualStudio.UnitTests.Models
{
    [TestClass]
    public class CamelCaseStringEnumConverterTests
    {
        [TestMethod]
        public void CamelCaseStringEnumConverterTest()
        {
            var foo = new Foo { Type = CodemarkType.Prcomment };
            var json = foo.ToJson();

            var result = json.FromJson<Foo>();
            Assert.IsTrue(json.Contains("prcomment"));
            Assert.AreEqual(CodemarkType.Prcomment, result.Type);
        }

        class Foo
        {
            public CodemarkType Type { get; set; }
        }
    }
}
