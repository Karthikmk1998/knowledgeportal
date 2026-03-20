using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;
using System.Linq;
using System;
using System.IO;
using System.Text.Json;
using System.Collections.Generic;
using System.Net;
using System.Text.Encodings.Web;
using KnowledgePortal.Services;

namespace KnowledgePortal.Controllers
{
    // Helper classes for Update Requests
    public class UpdateLinkRequest
    {
        public string OriginalTitle { get; set; }
        public string OriginalCategory { get; set; }
        public LinkItem NewItem { get; set; }
    }

    public class UpdateDocRequest
    {
        public string OriginalName { get; set; }
        public string OriginalCategory { get; set; }
        public DocItem NewItem { get; set; }
    }

    [ApiController]
    [Route("api/admin")]
    public class AdminController : ControllerBase
    {
        private readonly FileDataService _service;
        private readonly IWebHostEnvironment _env;
        private static readonly object _logLock = new object(); // 🔥 Added Lock for concurrent access

        public AdminController(FileDataService service, IWebHostEnvironment env)
        {
            _service = service;
            _env = env;
        }

        // =======================
        // 📝 LOGGING HELPER
        // =======================
        private void LogActivity(string action, string details = "")
        {
            try
            {
                var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
                var computerName = ip;
                try
                {
                    if (ip != null && ip != "::1" && ip != "127.0.0.1")
                    {
                        var hostEntry = Dns.GetHostEntry(HttpContext.Connection.RemoteIpAddress);
                        computerName = hostEntry.HostName;
                    }
                    else if (ip == "::1" || ip == "127.0.0.1")
                    {
                        computerName = Environment.MachineName + " (Localhost)";
                    }
                }
                catch { }

                var user = HttpContext.Session.GetString("Username") ?? "Anonymous";
                var timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
                var logLine = $"{timestamp} | User: {user} | PC: {computerName} ({ip}) | Action: {action} | {details}{Environment.NewLine}";

                var path = Path.Combine(_env.WebRootPath, "data", "activity_log.txt");

                lock (_logLock) // 🔥 Thread-safe file writing
                {
                    System.IO.File.AppendAllText(path, logLine);
                }
            }
            catch { }
        }

        // =======================
        // 🔐 AUTHENTICATION
        // =======================

        [HttpGet("check-auth")]
        public IActionResult CheckAuth()
        {
            var isAdmin = HttpContext.Session.GetString("IsAdmin") == "true";
            return Ok(isAdmin);
        }

        [HttpPost("login")]
        public IActionResult Login([FromBody] UserItem model)
        {
            var path = Path.Combine(_env.WebRootPath, "data", "users.json");
            if (!System.IO.File.Exists(path)) return StatusCode(500, "users.json missing");

            var json = System.IO.File.ReadAllText(path);
            var users = JsonSerializer.Deserialize<List<UserItem>>(json);

            // 🔥 UPDATED: Case-Insensitive Check for Username, Case-Sensitive for Password
            var user = users.FirstOrDefault(u =>
                u.Username.Equals(model.Username, StringComparison.OrdinalIgnoreCase) &&
                u.Password == model.Password);

            if (user != null)
            {
                HttpContext.Session.SetString("IsAdmin", "true");
                // Store the actual username from DB (e.g., "Admin") even if they typed "admin"
                HttpContext.Session.SetString("Username", user.Username);
                LogActivity("LOGIN", "Success");
                return Ok();
            }

            LogActivity("LOGIN FAILED", $"Attempted: {model.Username}");
            return Unauthorized("Invalid credentials");
        }

        [HttpPost("logout")]
        public IActionResult Logout()
        {
            LogActivity("LOGOUT");
            HttpContext.Session.Clear();
            return Ok();
        }

        // =======================
        // 🔥 USER MANAGEMENT
        // =======================
        [HttpPost("user/add")]
        public IActionResult AddUser([FromBody] UserItem item)
        {
            if (!IsAuthorized()) return Unauthorized();
            if (string.IsNullOrWhiteSpace(item.Username) || string.IsNullOrWhiteSpace(item.Password)) return BadRequest("Required");

            var path = Path.Combine(_env.WebRootPath, "data", "users.json");
            var json = System.IO.File.ReadAllText(path);
            var users = JsonSerializer.Deserialize<List<UserItem>>(json) ?? new List<UserItem>();

            if (users.Any(u => u.Username.Equals(item.Username, StringComparison.OrdinalIgnoreCase))) return Conflict("Exists");

            users.Add(item);

            var options = new JsonSerializerOptions
            {
                WriteIndented = true,
                Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
            };
            System.IO.File.WriteAllText(path, JsonSerializer.Serialize(users, options));

            LogActivity("ADD USER", $"Created: {item.Username}");
            return Ok();
        }

        private bool IsAuthorized() => HttpContext.Session.GetString("IsAdmin") == "true";

        // =======================
        // 🔥 LINK ACTIONS (Add, Delete, UPDATE)
        // =======================
        [HttpPost("link/add")]
        public IActionResult AddLink([FromBody] LinkItem item)
        {
            if (!IsAuthorized()) return Unauthorized();
            if (item == null || string.IsNullOrWhiteSpace(item.Title) || string.IsNullOrWhiteSpace(item.Url)) return BadRequest("Required");
            if (string.IsNullOrWhiteSpace(item.Category)) item.Category = "General";

            var links = _service.GetLinks();
            if (links.Any(l => l.Title.Equals(item.Title, StringComparison.OrdinalIgnoreCase) && (l.Category ?? "").Equals(item.Category, StringComparison.OrdinalIgnoreCase)))
                return Conflict("Link already exists in this category");

            links.Add(item);
            _service.SaveLinks(links);
            LogActivity("ADD LINK", $"{item.Title} ({item.Category})");
            return Ok();
        }

        [HttpPost("link/update")]
        public IActionResult UpdateLink([FromBody] UpdateLinkRequest req)
        {
            if (!IsAuthorized()) return Unauthorized();

            var links = _service.GetLinks();
            var oldItem = links.FirstOrDefault(l => l.Title.Equals(req.OriginalTitle, StringComparison.OrdinalIgnoreCase) && (l.Category ?? "General").Equals(req.OriginalCategory ?? "General", StringComparison.OrdinalIgnoreCase));

            if (oldItem == null) return NotFound("Original link not found");

            links.Remove(oldItem);

            if (string.IsNullOrWhiteSpace(req.NewItem.Category)) req.NewItem.Category = "General";
            links.Add(req.NewItem);

            _service.SaveLinks(links);
            LogActivity("UPDATE LINK", $"Updated: {req.OriginalTitle} -> {req.NewItem.Title}");
            return Ok();
        }

        [HttpPost("link/delete")]
        public IActionResult DeleteLink([FromBody] LinkItem item)
        {
            if (!IsAuthorized()) return Unauthorized();
            var links = _service.GetLinks();
            var toDelete = links.FirstOrDefault(l => l.Title.Equals(item.Title, StringComparison.OrdinalIgnoreCase) && (l.Category ?? "General").Equals(item.Category ?? "General", StringComparison.OrdinalIgnoreCase));
            if (toDelete == null) return NotFound("Not found");
            links.Remove(toDelete);
            _service.SaveLinks(links);
            LogActivity("DELETE LINK", $"{item.Title} ({item.Category})");
            return Ok();
        }

        // =======================
        // 🔥 DOC ACTIONS (Add, Delete, UPDATE)
        // =======================
        [HttpPost("doc/add")]
        public IActionResult AddDoc([FromBody] DocItem item)
        {
            if (!IsAuthorized()) return Unauthorized();
            if (string.IsNullOrWhiteSpace(item.Name) || string.IsNullOrWhiteSpace(item.Path)) return BadRequest("Required");
            if (string.IsNullOrWhiteSpace(item.Category)) item.Category = "General";

            var docs = _service.GetDocs();
            if (docs.Any(d => d.Name.Equals(item.Name, StringComparison.OrdinalIgnoreCase) && (d.Category ?? "").Equals(item.Category, StringComparison.OrdinalIgnoreCase)))
                return Conflict("Document already exists in this category");

            docs.Add(item);
            _service.SaveDocs(docs);
            LogActivity("ADD DOC", $"{item.Name} ({item.Category})");
            return Ok();
        }

        [HttpPost("doc/update")]
        public IActionResult UpdateDoc([FromBody] UpdateDocRequest req)
        {
            if (!IsAuthorized()) return Unauthorized();

            var docs = _service.GetDocs();
            var oldItem = docs.FirstOrDefault(d => d.Name.Equals(req.OriginalName, StringComparison.OrdinalIgnoreCase) && (d.Category ?? "General").Equals(req.OriginalCategory ?? "General", StringComparison.OrdinalIgnoreCase));

            if (oldItem == null) return NotFound("Original document not found");

            docs.Remove(oldItem);
            if (string.IsNullOrWhiteSpace(req.NewItem.Category)) req.NewItem.Category = "General";
            docs.Add(req.NewItem);

            _service.SaveDocs(docs);
            LogActivity("UPDATE DOC", $"Updated: {req.OriginalName} -> {req.NewItem.Name}");
            return Ok();
        }

        [HttpPost("doc/delete")]
        public IActionResult DeleteDoc([FromBody] DocItem item)
        {
            if (!IsAuthorized()) return Unauthorized();
            var docs = _service.GetDocs();
            var toDelete = docs.FirstOrDefault(d => d.Name.Equals(item.Name, StringComparison.OrdinalIgnoreCase) && (d.Category ?? "General").Equals(item.Category ?? "General", StringComparison.OrdinalIgnoreCase));
            if (toDelete == null) return NotFound("Document not found");
            docs.Remove(toDelete);
            _service.SaveDocs(docs);
            LogActivity("DELETE DOC", $"{item.Name} ({item.Category})");
            return Ok();
        }
    }
}