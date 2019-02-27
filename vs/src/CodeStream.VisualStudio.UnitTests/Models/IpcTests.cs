﻿using CodeStream.VisualStudio.Models;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;
using System.Collections.Generic;

namespace CodeStream.VisualStudio.UnitTests.Models
{
    [TestClass]
    public class IpcTests
    {
        [TestMethod]
        [DataRow("foo")]
        public void ToResponseMessageStringsTest(string payload)
        {
            var response = Ipc.ToResponseMessage("123", payload);
            var parsed = JToken.Parse(response);
            Assert.IsTrue(parsed["params"].Value<string>() == payload);
        }

        [TestMethod]
        [DataRow(true)]
        [DataRow(false)]
        public void ToResponseMessageBoolTest(bool payload)
        {
            var response = Ipc.ToResponseMessage("123", payload);
            var parsed = JToken.Parse(response);
            Assert.IsTrue(parsed["params"].Value<bool>() == payload);
        }

        [TestMethod]
        [DataRow(10)]
        public void ToResponseMessageNumberTest(int payload)
        {
            var response = Ipc.ToResponseMessage("123", payload.ToString());
            var parsed = JToken.Parse(response);
            Assert.IsTrue(parsed["params"].Value<int>() == payload);
        }

        [TestMethod]
        public void ToResponseMessageObjectTest()
        {
            var value = "value";
            var foo = new { key = value };
            var response = Ipc.ToResponseMessage("123", JObject.FromObject(foo), null);
            var parsed = JToken.Parse(response);
            Assert.IsTrue(parsed["params"]["key"].Value<string>() == value);
        }

        [TestMethod]
        public void ToResponseMessageArrayTest()
        {
            var foo = new List<object> { new { test = "value1" }, new { test = "value2" } };
            var response = Ipc.ToResponseMessage("123", JArray.FromObject(foo), null);
            var parsed = JToken.Parse(response);
            Assert.IsTrue(parsed["params"][1]["test"].Value<string>() == "value2");
        }
    }
}