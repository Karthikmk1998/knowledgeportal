using Microsoft.AspNetCore.Mvc;
using System.Net;
using System;
using System.IO;
using Microsoft.AspNetCore.Hosting; // Required for IWebHostEnvironment

namespace KnowledgePortal.Controllers
{
    public class HomeController : Controller
    {
        private readonly IWebHostEnvironment _env;
        private static readonly object _logLock = new object(); // 🔥 Added Lock for concurrent access

        public HomeController(IWebHostEnvironment env)
        {
            _env = env;
        }

        public IActionResult Index()
        {
            // 🔥 LOG THE VISIT
            LogVisit();
            return View();
        }

        public IActionResult Login()
        {
            return View();
        }

        private void LogVisit()
        {
            try
            {
                var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
                var computerName = ip;

                try
                {
                    // Handle Localhost specifically to show actual Machine Name
                    if (ip == "::1" || ip == "127.0.0.1")
                    {
                        computerName = Environment.MachineName + " (Localhost)";
                    }
                    else if (ip != null)
                    {
                        // Try Reverse DNS for remote clients
                        computerName = Dns.GetHostEntry(HttpContext.Connection.RemoteIpAddress).HostName;
                    }
                }
                catch { }

                var path = Path.Combine(_env.WebRootPath, "data", "activity_log.txt");
                var logLine = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} | VISITOR | PC: {computerName} ({ip}) | Action: VIEW HOMEPAGE | - {Environment.NewLine}";

                lock (_logLock) // 🔥 Thread-safe file writing
                {
                    System.IO.File.AppendAllText(path, logLine);
                }
            }
            catch { /* Ignore logging errors */ }
        }
    }
}