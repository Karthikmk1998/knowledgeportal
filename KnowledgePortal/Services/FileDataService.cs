using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Hosting;
using KnowledgePortal.Controllers;

namespace KnowledgePortal.Services
{
    public class FileDataService
    {
        private readonly string _linkFile;
        private readonly string _docFile;
        private static readonly object _fileLock = new object(); // 🔥 Added Lock for thread safety

        public FileDataService(IWebHostEnvironment env)
        {
            // 🔥 FIX FOR PUBLISHING: Use WebRootPath directly to guarantee correct wwwroot resolution
            var dataDir = Path.Combine(env.WebRootPath, "data");

            Directory.CreateDirectory(dataDir);

            _linkFile = Path.Combine(dataDir, "links.json");
            _docFile = Path.Combine(dataDir, "docs.json");

            if (!File.Exists(_linkFile)) File.WriteAllText(_linkFile, "[]");
            if (!File.Exists(_docFile)) File.WriteAllText(_docFile, "[]");
        }

        // 🔥 SHARED OPTIONS: Fixes quotes saving issues
        private JsonSerializerOptions GetOptions()
        {
            return new JsonSerializerOptions
            {
                WriteIndented = true,
                Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
            };
        }

        public List<LinkItem> GetLinks()
        {
            if (!File.Exists(_linkFile)) return new List<LinkItem>();
            var json = File.ReadAllText(_linkFile);
            if (string.IsNullOrWhiteSpace(json)) return new List<LinkItem>();
            return JsonSerializer.Deserialize<List<LinkItem>>(json) ?? new List<LinkItem>();
        }

        public List<DocItem> GetDocs()
        {
            if (!File.Exists(_docFile)) return new List<DocItem>();
            var json = File.ReadAllText(_docFile);
            if (string.IsNullOrWhiteSpace(json)) return new List<DocItem>();
            return JsonSerializer.Deserialize<List<DocItem>>(json) ?? new List<DocItem>();
        }

        public void SaveLinks(List<LinkItem> data)
        {
            lock (_fileLock) // 🔥 Ensure only one thread writes at a time
            {
                var json = JsonSerializer.Serialize(data, GetOptions());
                File.WriteAllText(_linkFile, json);
            }
        }

        public void SaveDocs(List<DocItem> data)
        {
            lock (_fileLock) // 🔥 Ensure only one thread writes at a time
            {
                var json = JsonSerializer.Serialize(data, GetOptions());
                File.WriteAllText(_docFile, json);
            }
        }
    }
}