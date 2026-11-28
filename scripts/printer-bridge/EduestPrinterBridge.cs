using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Printing;
using System.IO;
using System.Net;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;
using Windows.Data.Pdf;
using Windows.Foundation;
using Windows.Storage.Streams;

namespace EduestPrinterBridge
{
    [DataContract]
    internal class PrintHtmlRequest
    {
        [DataMember(Name = "printerName")]
        public string PrinterName { get; set; }

        [DataMember(Name = "jobTitle")]
        public string JobTitle { get; set; }

        [DataMember(Name = "html")]
        public string Html { get; set; }

        [DataMember(Name = "copies")]
        public int Copies { get; set; }

        [DataMember(Name = "duplex")]
        public string Duplex { get; set; }
    }

    [DataContract]
    internal class PrintHtmlBatchItem
    {
        [DataMember(Name = "jobTitle")]
        public string JobTitle { get; set; }

        [DataMember(Name = "firstSheetHtml")]
        public string FirstSheetHtml { get; set; }
    }

    [DataContract]
    internal class PrintHtmlBatchRequest
    {
        [DataMember(Name = "printerName")]
        public string PrinterName { get; set; }

        [DataMember(Name = "copies")]
        public int Copies { get; set; }

        [DataMember(Name = "duplex")]
        public string Duplex { get; set; }

        [DataMember(Name = "sharedRestHtml")]
        public string SharedRestHtml { get; set; }

        [DataMember(Name = "jobs")]
        public PrintHtmlBatchItem[] Jobs { get; set; }
    }

    [DataContract]
    internal class PrintPdfRequest
    {
        [DataMember(Name = "printerName")]
        public string PrinterName { get; set; }

        [DataMember(Name = "jobTitle")]
        public string JobTitle { get; set; }

        [DataMember(Name = "pdfBase64")]
        public string PdfBase64 { get; set; }

        [DataMember(Name = "copies")]
        public int Copies { get; set; }

        [DataMember(Name = "duplex")]
        public string Duplex { get; set; }
    }

    internal sealed class TrayBridgeContext : ApplicationContext
    {
        private const int BridgePort = 48921;
        private const string BridgeVersion = "1.1.0";
        private const string RunRegistryPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string RunRegistryKey = "EduestPrinterBridge";
        private const double RenderDpi = 240.0;
        private static readonly Guid BmpEncoderGuid = new Guid("69be8bb4-d66d-47c8-865a-ed1589433782");

        private readonly NotifyIcon _trayIcon;
        private readonly ToolStripMenuItem _statusMenuItem;
        private readonly ToolStripMenuItem _autoStartMenuItem;
        private readonly HttpListener _listener;
        private readonly Thread _serverThread;
        private readonly object _printLock = new object();
        private readonly object _cdpLock = new object();
        private readonly string _cdpProfileDir;
        private Process _warmBrowserProc;
        private string _warmBrowserWsUrl;
        private volatile bool _running = true;

        public TrayBridgeContext()
        {
            _cdpProfileDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "EduestPrinterBridge",
                "cdp-profile"
            );

            _statusMenuItem = new ToolStripMenuItem("상태: 127.0.0.1:" + BridgePort + " 대기 중 (v" + BridgeVersion + ")")
            {
                Enabled = false
            };

            _autoStartMenuItem = new ToolStripMenuItem("윈도우 시작 시 자동 실행")
            {
                Checked = IsAutoStartEnabled(),
                CheckOnClick = false
            };
            _autoStartMenuItem.Click += OnToggleAutoStart;

            var refreshItem = new ToolStripMenuItem("연결된 프린터 새로고침");
            refreshItem.Click += (s, e) => RefreshPrintersNotification(true);

            var listItem = new ToolStripMenuItem("설치된 프린터 목록 보기");
            listItem.Click += OnShowPrintersDialog;

            var exitItem = new ToolStripMenuItem("브릿지 종료");
            exitItem.Click += OnExitClick;

            var menu = new ContextMenuStrip();
            menu.Items.Add(_statusMenuItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(refreshItem);
            menu.Items.Add(listItem);
            menu.Items.Add(_autoStartMenuItem);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(exitItem);

            _trayIcon = new NotifyIcon
            {
                Icon = CreatePrinterTrayIcon(),
                ContextMenuStrip = menu,
                Visible = true
            };
            _trayIcon.DoubleClick += OnShowPrintersDialog;

            _listener = new HttpListener();
            _listener.Prefixes.Add("http://127.0.0.1:" + BridgePort + "/");
            _listener.Start();

            _serverThread = new Thread(ServerLoop)
            {
                IsBackground = true,
                Name = "EduestPrinterBridgeHttp"
            };
            _serverThread.Start();

            // 백그라운드에서 상주 헤드리스 브라우저 사전 예열 (첫 출력 반응속도 단축)
            WarmUpBrowserAsync();

            RefreshPrintersNotification(false);
            _trayIcon.ShowBalloonTip(
                3500,
                "Eduest 고속 프린터 브릿지 v" + BridgeVersion + " 시작됨",
                "백그라운드 고속 엔진이 예열 중입니다. 시험지 인쇄 화면에서 프린터를 바로 선택해 출력할 수 있습니다.",
                ToolTipIcon.Info
            );
        }

        private void RefreshPrintersNotification(bool showBalloon)
        {
            int count = PrinterSettings.InstalledPrinters.Count;
            string defaultPrinter = GetDefaultPrinterName();
            string tip = string.Format("Eduest 고속 프린터 브릿지 v{0} ({1}대)", BridgeVersion, count);
            if (tip.Length > 63) tip = tip.Substring(0, 63);
            _trayIcon.Text = tip;
            _statusMenuItem.Text = string.Format("실행 중 v{0} (127.0.0.1:{1} · {2}대)", BridgeVersion, BridgePort, count);

            if (showBalloon)
            {
                _trayIcon.ShowBalloonTip(
                    3000,
                    "프린터 목록 새로고침 완료",
                    string.Format("감지된 프린터: {0}대\n기본 프린터: {1}", count, string.IsNullOrEmpty(defaultPrinter) ? "없음" : defaultPrinter),
                    ToolTipIcon.Info
                );
            }
        }

        private void OnShowPrintersDialog(object sender, EventArgs e)
        {
            string defaultPrinter = GetDefaultPrinterName();
            var sb = new StringBuilder();
            sb.AppendLine("Eduest 고속 프린터 브릿지 v" + BridgeVersion);
            sb.AppendLine("로컬 주소: http://127.0.0.1:" + BridgePort);
            sb.AppendLine();
            sb.AppendLine("감지된 프린터 목록 (" + PrinterSettings.InstalledPrinters.Count + "대):");
            foreach (string name in PrinterSettings.InstalledPrinters)
            {
                bool isDef = string.Equals(name, defaultPrinter, StringComparison.OrdinalIgnoreCase);
                sb.AppendLine((isDef ? "★ [기본] " : "  • ") + name);
            }
            MessageBox.Show(sb.ToString(), "Eduest 프린터 브릿지", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private bool IsAutoStartEnabled()
        {
            try
            {
                using (var key = Registry.CurrentUser.OpenSubKey(RunRegistryPath, false))
                {
                    if (key == null) return false;
                    object val = key.GetValue(RunRegistryKey);
                    return val != null && !string.IsNullOrWhiteSpace(val.ToString());
                }
            }
            catch
            {
                return false;
            }
        }

        private void OnToggleAutoStart(object sender, EventArgs e)
        {
            try
            {
                bool next = !_autoStartMenuItem.Checked;
                using (var key = Registry.CurrentUser.OpenSubKey(RunRegistryPath, true) ?? Registry.CurrentUser.CreateSubKey(RunRegistryPath))
                {
                    if (key != null)
                    {
                        if (next)
                        {
                            key.SetValue(RunRegistryKey, "\"" + Application.ExecutablePath + "\"");
                        }
                        else
                        {
                            key.DeleteValue(RunRegistryKey, false);
                        }
                    }
                }
                _autoStartMenuItem.Checked = next;
                _trayIcon.ShowBalloonTip(
                    2500,
                    "자동 실행 설정 변경",
                    next ? "윈도우 시작 시 자동으로 실행되도록 등록했습니다." : "윈도우 시작 시 자동 실행을 해제했습니다.",
                    ToolTipIcon.Info
                );
            }
            catch (Exception ex)
            {
                MessageBox.Show("자동 실행 설정 변경 중 오류: " + ex.Message, "Eduest 프린터 브릿지", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void OnExitClick(object sender, EventArgs e)
        {
            Shutdown();
            ExitThread();
        }

        public void Shutdown()
        {
            _running = false;
            try { if (_listener.IsListening) _listener.Stop(); } catch { }
            try { _listener.Close(); } catch { }
            lock (_cdpLock)
            {
                KillWarmBrowserLocked();
            }
            try
            {
                _trayIcon.Visible = false;
                _trayIcon.Dispose();
            }
            catch { }
        }

        private void ServerLoop()
        {
            while (_running)
            {
                try
                {
                    var ctx = _listener.GetContext();
                    ThreadPool.QueueUserWorkItem(_ => HandleRequest(ctx));
                }
                catch
                {
                    if (!_running) break;
                }
            }
        }

        private static void ApplyCorsHeaders(HttpListenerRequest req, HttpListenerResponse res)
        {
            string origin = req.Headers["Origin"];
            res.Headers["Access-Control-Allow-Origin"] = string.IsNullOrEmpty(origin) ? "*" : origin;
            res.Headers["Vary"] = "Origin";
            res.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
            res.Headers["Access-Control-Allow-Headers"] = "Content-Type, Access-Control-Request-Private-Network";
            res.Headers["Access-Control-Allow-Private-Network"] = "true";
            res.Headers["Cache-Control"] = "no-store";
        }

        private static void WriteJson(HttpListenerResponse res, int statusCode, string json)
        {
            res.StatusCode = statusCode;
            res.ContentType = "application/json; charset=utf-8";
            byte[] buf = Encoding.UTF8.GetBytes(json);
            res.ContentLength64 = buf.Length;
            res.OutputStream.Write(buf, 0, buf.Length);
            res.OutputStream.Close();
        }

        private static string JsonEscape(string s)
        {
            if (s == null) return "null";
            var sb = new StringBuilder();
            sb.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < ' ')
                            sb.AppendFormat("\\u{0:X4}", (int)c);
                        else
                            sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
            return sb.ToString();
        }

        private void HandleRequest(HttpListenerContext ctx)
        {
            var req = ctx.Request;
            var res = ctx.Response;
            try
            {
                ApplyCorsHeaders(req, res);

                if (string.Equals(req.HttpMethod, "OPTIONS", StringComparison.OrdinalIgnoreCase))
                {
                    res.StatusCode = 204;
                    res.ContentLength64 = 0;
                    res.OutputStream.Close();
                    return;
                }

                string path = (req.Url != null ? req.Url.AbsolutePath : "/").TrimEnd('/').ToLowerInvariant();
                if (string.IsNullOrEmpty(path)) path = "/";

                if (req.HttpMethod == "GET" && (path == "/health" || path == "/"))
                {
                    string def = GetDefaultPrinterName();
                    int count = PrinterSettings.InstalledPrinters.Count;
                    string json = string.Format(
                        "{{\"ok\":true,\"version\":{0},\"port\":{1},\"printerCount\":{2},\"defaultPrinter\":{3}}}",
                        JsonEscape(BridgeVersion),
                        BridgePort,
                        count,
                        JsonEscape(def)
                    );
                    WriteJson(res, 200, json);
                    return;
                }

                if (req.HttpMethod == "GET" && path == "/printers")
                {
                    string def = GetDefaultPrinterName();
                    var items = new List<string>();
                    foreach (string name in PrinterSettings.InstalledPrinters)
                    {
                        bool isDef = string.Equals(name, def, StringComparison.OrdinalIgnoreCase);
                        items.Add(string.Format("{{\"name\":{0},\"isDefault\":{1}}}", JsonEscape(name), isDef ? "true" : "false"));
                    }
                    string json = string.Format(
                        "{{\"ok\":true,\"version\":{0},\"defaultPrinter\":{1},\"printers\":[{2}]}}",
                        JsonEscape(BridgeVersion),
                        JsonEscape(def),
                        string.Join(",", items.ToArray())
                    );
                    WriteJson(res, 200, json);
                    return;
                }

                if (req.HttpMethod == "POST" && path == "/print-html")
                {
                    string body = ReadBodyString(req);
                    var payload = DeserializeJson<PrintHtmlRequest>(body);
                    if (payload == null || string.IsNullOrWhiteSpace(payload.Html))
                    {
                        WriteJson(res, 400, "{\"ok\":false,\"error\":\"인쇄할 HTML 데이터가 비어 있습니다.\"}");
                        return;
                    }
                    string targetPrinter = ResolvePrinterName(payload.PrinterName);
                    int copies = payload.Copies > 0 ? Math.Min(99, payload.Copies) : 1;
                    string jobTitle = string.IsNullOrWhiteSpace(payload.JobTitle) ? "Eduest Exam Print" : payload.JobTitle;

                    int pagesPrinted = PrintHtmlSilently(payload.Html, targetPrinter, jobTitle, copies, payload.Duplex);
                    WriteJson(res, 200, string.Format("{{\"ok\":true,\"printer\":{0},\"pages\":{1}}}", JsonEscape(targetPrinter), pagesPrinted));
                    return;
                }

                if (req.HttpMethod == "POST" && path == "/print-html-batch")
                {
                    string body = ReadBodyString(req);
                    var payload = DeserializeJson<PrintHtmlBatchRequest>(body);
                    if (payload == null || payload.Jobs == null || payload.Jobs.Length == 0)
                    {
                        WriteJson(res, 400, "{\"ok\":false,\"error\":\"일괄 인쇄 작업 목록이 비어 있습니다.\"}");
                        return;
                    }
                    string targetPrinter = ResolvePrinterName(payload.PrinterName);
                    int copies = payload.Copies > 0 ? Math.Min(99, payload.Copies) : 1;

                    int totalPages = PrintHtmlBatchSilently(payload, targetPrinter, copies);
                    WriteJson(
                        res,
                        200,
                        string.Format("{{\"ok\":true,\"printer\":{0},\"jobs\":{1},\"pages\":{2}}}", JsonEscape(targetPrinter), payload.Jobs.Length, totalPages)
                    );
                    return;
                }

                if (req.HttpMethod == "POST" && path == "/print-pdf")
                {
                    string body = ReadBodyString(req);
                    var payload = DeserializeJson<PrintPdfRequest>(body);
                    if (payload == null || string.IsNullOrWhiteSpace(payload.PdfBase64))
                    {
                        WriteJson(res, 400, "{\"ok\":false,\"error\":\"인쇄할 PDF 데이터가 비어 있습니다.\"}");
                        return;
                    }
                    byte[] pdfBytes = Convert.FromBase64String(payload.PdfBase64);
                    string targetPrinter = ResolvePrinterName(payload.PrinterName);
                    int copies = payload.Copies > 0 ? Math.Min(99, payload.Copies) : 1;
                    string jobTitle = string.IsNullOrWhiteSpace(payload.JobTitle) ? "Eduest Exam PDF" : payload.JobTitle;

                    int pagesPrinted = PrintPdfBytesSilently(pdfBytes, targetPrinter, jobTitle, copies, payload.Duplex);
                    WriteJson(res, 200, string.Format("{{\"ok\":true,\"printer\":{0},\"pages\":{1}}}", JsonEscape(targetPrinter), pagesPrinted));
                    return;
                }

                WriteJson(res, 404, "{\"ok\":false,\"error\":\"Not found\"}");
            }
            catch (Exception ex)
            {
                try
                {
                    WriteJson(res, 500, "{\"ok\":false,\"error\":" + JsonEscape(ex.Message) + "}");
                }
                catch { }
            }
        }

        private static string ReadBodyString(HttpListenerRequest req)
        {
            using (var reader = new StreamReader(req.InputStream, Encoding.UTF8))
            {
                return reader.ReadToEnd();
            }
        }

        private static T DeserializeJson<T>(string json) where T : class
        {
            var serializer = new DataContractJsonSerializer(typeof(T));
            byte[] bytes = Encoding.UTF8.GetBytes(json);
            using (var ms = new MemoryStream(bytes))
            {
                return serializer.ReadObject(ms) as T;
            }
        }

        private static string GetDefaultPrinterName()
        {
            try
            {
                var ps = new PrinterSettings();
                return ps.PrinterName ?? "";
            }
            catch
            {
                return "";
            }
        }

        private static string ResolvePrinterName(string requested)
        {
            if (!string.IsNullOrWhiteSpace(requested))
            {
                foreach (string name in PrinterSettings.InstalledPrinters)
                {
                    if (string.Equals(name, requested.Trim(), StringComparison.OrdinalIgnoreCase))
                        return name;
                }
                throw new InvalidOperationException("선택한 프린터를 찾을 수 없습니다: " + requested);
            }
            string def = GetDefaultPrinterName();
            if (string.IsNullOrWhiteSpace(def))
                throw new InvalidOperationException("사용 가능한 기본 프린터가 없습니다.");
            return def;
        }

        private static List<string> FindHeadlessBrowserPaths()
        {
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string[] candidates = new[]
            {
                @"C:\Program Files\Google\Chrome\Application\chrome.exe",
                @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                Path.Combine(localAppData, @"Google\Chrome\Application\chrome.exe"),
                @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
                Path.Combine(localAppData, @"Microsoft\Edge\Application\msedge.exe"),
            };
            var found = new List<string>();
            foreach (string c in candidates)
            {
                if (!string.IsNullOrEmpty(c) && File.Exists(c) && !found.Contains(c))
                {
                    found.Add(c);
                }
            }
            return found;
        }

        private void WarmUpBrowserAsync()
        {
            ThreadPool.QueueUserWorkItem(_ =>
            {
                if (!_running) return;
                lock (_cdpLock)
                {
                    try { EnsureWarmBrowserLocked(); } catch { }
                }
            });
        }

        private void KillWarmBrowserLocked()
        {
            if (_warmBrowserProc != null)
            {
                try
                {
                    if (!_warmBrowserProc.HasExited)
                    {
                        int pid = _warmBrowserProc.Id;
                        try
                        {
                            var killer = Process.Start(new ProcessStartInfo
                            {
                                FileName = "taskkill",
                                Arguments = "/T /F /PID " + pid,
                                CreateNoWindow = true,
                                UseShellExecute = false,
                                WindowStyle = ProcessWindowStyle.Hidden
                            });
                            if (killer != null) killer.WaitForExit(1500);
                        }
                        catch { }
                        try { if (!_warmBrowserProc.HasExited) _warmBrowserProc.Kill(); } catch { }
                    }
                }
                catch { }
                try { _warmBrowserProc.Dispose(); } catch { }
                _warmBrowserProc = null;
            }
            _warmBrowserWsUrl = null;
        }

        private bool EnsureWarmBrowserLocked()
        {
            if (_warmBrowserProc != null && !_warmBrowserProc.HasExited && !string.IsNullOrEmpty(_warmBrowserWsUrl))
            {
                return true;
            }

            KillWarmBrowserLocked();

            var browserPaths = FindHeadlessBrowserPaths();
            if (browserPaths.Count == 0) return false;

            string activePortFile = Path.Combine(_cdpProfileDir, "DevToolsActivePort");

            foreach (string browserPath in browserPaths)
            {
                try
                {
                    Directory.CreateDirectory(_cdpProfileDir);
                    try { if (File.Exists(activePortFile)) File.Delete(activePortFile); } catch { }

                    string args = string.Format(
                        "--headless=new --disable-gpu --no-first-run --no-default-browser-check --disable-extensions --disable-background-networking --disable-sync --no-pdf-header-footer --remote-debugging-port=0 --user-data-dir=\"{0}\" about:blank",
                        _cdpProfileDir
                    );

                    var psi = new ProcessStartInfo
                    {
                        FileName = browserPath,
                        Arguments = args,
                        UseShellExecute = false,
                        CreateNoWindow = true,
                        WindowStyle = ProcessWindowStyle.Hidden
                    };

                    var proc = Process.Start(psi);
                    if (proc == null) continue;

                    var sw = Stopwatch.StartNew();
                    string wsUrl = null;
                    while (sw.ElapsedMilliseconds < 7000 && !proc.HasExited)
                    {
                        if (File.Exists(activePortFile))
                        {
                            try
                            {
                                string[] lines = File.ReadAllLines(activePortFile, Encoding.UTF8);
                                if (lines.Length >= 2 && !string.IsNullOrWhiteSpace(lines[0]) && !string.IsNullOrWhiteSpace(lines[1]))
                                {
                                    wsUrl = "ws://127.0.0.1:" + lines[0].Trim() + lines[1].Trim();
                                    break;
                                }
                            }
                            catch { }
                        }
                        Thread.Sleep(40);
                    }

                    if (!string.IsNullOrEmpty(wsUrl) && !proc.HasExited)
                    {
                        _warmBrowserProc = proc;
                        _warmBrowserWsUrl = wsUrl;
                        return true;
                    }

                    try { if (!proc.HasExited) proc.Kill(); } catch { }
                    try { proc.Dispose(); } catch { }
                }
                catch { }
            }

            return false;
        }

        private static JavaScriptSerializer CreateCdpSerializer()
        {
            var serializer = new JavaScriptSerializer();
            serializer.MaxJsonLength = int.MaxValue;
            serializer.RecursionLimit = 64;
            return serializer;
        }

        private static string ReceiveWebSocketText(ClientWebSocket ws, CancellationToken token)
        {
            byte[] buffer = new byte[65536];
            using (var ms = new MemoryStream())
            {
                while (true)
                {
                    var seg = new ArraySegment<byte>(buffer);
                    var result = ws.ReceiveAsync(seg, token).GetAwaiter().GetResult();
                    if (result.MessageType == WebSocketMessageType.Close)
                        throw new InvalidOperationException("CDP WebSocket closed.");
                    if (result.Count > 0)
                        ms.Write(buffer, 0, result.Count);
                    if (result.EndOfMessage)
                        break;
                }
                return Encoding.UTF8.GetString(ms.ToArray());
            }
        }

        private static Dictionary<string, object> SendCdpCommand(
            ClientWebSocket ws,
            JavaScriptSerializer serializer,
            ref int nextId,
            string sessionId,
            string method,
            Dictionary<string, object> paramDict,
            int timeoutMs)
        {
            int cmdId = ++nextId;
            var msg = new Dictionary<string, object>();
            msg["id"] = cmdId;
            msg["method"] = method;
            if (paramDict != null) msg["params"] = paramDict;
            if (!string.IsNullOrEmpty(sessionId)) msg["sessionId"] = sessionId;

            string json = serializer.Serialize(msg);
            byte[] bytes = Encoding.UTF8.GetBytes(json);

            using (var cts = new CancellationTokenSource(timeoutMs))
            {
                ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, cts.Token).GetAwaiter().GetResult();

                while (true)
                {
                    string respText = ReceiveWebSocketText(ws, cts.Token);
                    var obj = serializer.DeserializeObject(respText) as Dictionary<string, object>;
                    if (obj == null) continue;

                    object idObj;
                    if (obj.TryGetValue("id", out idObj) && Convert.ToInt32(idObj) == cmdId)
                    {
                        object errObj;
                        if (obj.TryGetValue("error", out errObj) && errObj != null)
                        {
                            var errDict = errObj as Dictionary<string, object>;
                            string errMsg = (errDict != null && errDict.ContainsKey("message")) ? Convert.ToString(errDict["message"]) : "CDP Error";
                            throw new InvalidOperationException(method + ": " + errMsg);
                        }
                        object resObj;
                        if (obj.TryGetValue("result", out resObj))
                            return resObj as Dictionary<string, object>;
                        return new Dictionary<string, object>();
                    }
                }
            }
        }

        private static void WaitCdpEvent(
            ClientWebSocket ws,
            JavaScriptSerializer serializer,
            string sessionId,
            string eventName,
            int timeoutMs)
        {
            using (var cts = new CancellationTokenSource(timeoutMs))
            {
                while (true)
                {
                    string text = ReceiveWebSocketText(ws, cts.Token);
                    var obj = serializer.DeserializeObject(text) as Dictionary<string, object>;
                    if (obj == null) continue;

                    object methodObj;
                    if (!obj.TryGetValue("method", out methodObj)) continue;
                    if (!string.Equals(Convert.ToString(methodObj), eventName, StringComparison.Ordinal)) continue;

                    if (!string.IsNullOrEmpty(sessionId))
                    {
                        object sidObj;
                        if (!obj.TryGetValue("sessionId", out sidObj) || !string.Equals(Convert.ToString(sidObj), sessionId, StringComparison.Ordinal))
                            continue;
                    }
                    return;
                }
            }
        }

        private byte[] RenderHtmlViaCdp(string fileUri)
        {
            lock (_cdpLock)
            {
                if (!EnsureWarmBrowserLocked())
                    throw new InvalidOperationException("상주 헤드리스 브라우저를 시작할 수 없습니다.");

                var serializer = CreateCdpSerializer();
                int nextId = 0;
                string targetId = null;

                using (var ws = new ClientWebSocket())
                {
                    using (var connCts = new CancellationTokenSource(5000))
                    {
                        ws.ConnectAsync(new Uri(_warmBrowserWsUrl), connCts.Token).GetAwaiter().GetResult();
                    }

                    try
                    {
                        var createRes = SendCdpCommand(ws, serializer, ref nextId, null, "Target.createTarget", new Dictionary<string, object>
                        {
                            { "url", "about:blank" }
                        }, 5000);
                        targetId = Convert.ToString(createRes["targetId"]);

                        var attachRes = SendCdpCommand(ws, serializer, ref nextId, null, "Target.attachToTarget", new Dictionary<string, object>
                        {
                            { "targetId", targetId },
                            { "flatten", true }
                        }, 5000);
                        string sessionId = Convert.ToString(attachRes["sessionId"]);

                        SendCdpCommand(ws, serializer, ref nextId, sessionId, "Page.enable", null, 5000);
                        SendCdpCommand(ws, serializer, ref nextId, sessionId, "Page.navigate", new Dictionary<string, object>
                        {
                            { "url", fileUri }
                        }, 10000);

                        WaitCdpEvent(ws, serializer, sessionId, "Page.loadEventFired", 20000);

                        // 웹폰트/이미지 디코딩 완료 보장
                        try
                        {
                            SendCdpCommand(ws, serializer, ref nextId, sessionId, "Runtime.evaluate", new Dictionary<string, object>
                            {
                                { "expression", "(document.fonts && document.fonts.ready) ? document.fonts.ready.then(function(){return true;}) : true" },
                                { "awaitPromise", true },
                                { "returnByValue", true }
                            }, 5000);
                        }
                        catch { }

                        var pdfRes = SendCdpCommand(ws, serializer, ref nextId, sessionId, "Page.printToPDF", new Dictionary<string, object>
                        {
                            { "printBackground", true },
                            { "preferCSSPageSize", true },
                            { "marginTop", 0.0 },
                            { "marginBottom", 0.0 },
                            { "marginLeft", 0.0 },
                            { "marginRight", 0.0 },
                            { "transferMode", "ReturnAsBase64" }
                        }, 35000);

                        string b64 = pdfRes != null && pdfRes.ContainsKey("data") ? Convert.ToString(pdfRes["data"]) : null;
                        if (string.IsNullOrEmpty(b64))
                            throw new InvalidOperationException("CDP printToPDF returned empty data.");

                        return Convert.FromBase64String(b64);
                    }
                    finally
                    {
                        if (!string.IsNullOrEmpty(targetId))
                        {
                            try
                            {
                                SendCdpCommand(ws, serializer, ref nextId, null, "Target.closeTarget", new Dictionary<string, object>
                                {
                                    { "targetId", targetId }
                                }, 1500);
                            }
                            catch { }
                        }
                    }
                }
            }
        }

        private static bool RunHeadlessPdfAttempt(string browserPath, string profileDir, string pdfPath, string fileUri, bool useShellHidden, out string diag)
        {
            diag = "";
            try { if (File.Exists(pdfPath)) File.Delete(pdfPath); } catch { }
            try
            {
                if (Directory.Exists(profileDir)) Directory.Delete(profileDir, true);
                Directory.CreateDirectory(profileDir);
            }
            catch { }

            string args = string.Format(
                "--headless=new --disable-gpu --no-first-run --no-default-browser-check --no-pdf-header-footer --user-data-dir=\"{0}\" --print-to-pdf=\"{1}\" \"{2}\"",
                profileDir, pdfPath, fileUri
            );

            var psi = new ProcessStartInfo
            {
                FileName = browserPath,
                Arguments = args,
                UseShellExecute = useShellHidden,
                CreateNoWindow = !useShellHidden,
                WindowStyle = ProcessWindowStyle.Hidden,
            };

            using (var proc = Process.Start(psi))
            {
                if (proc == null)
                {
                    diag = Path.GetFileName(browserPath) + ": 프로세스 시작 실패";
                    return false;
                }
                if (!proc.WaitForExit(45000))
                {
                    try { proc.Kill(); } catch { }
                    diag = Path.GetFileName(browserPath) + ": 시간 초과";
                    return false;
                }
                if (File.Exists(pdfPath) && new FileInfo(pdfPath).Length > 0)
                {
                    return true;
                }
                diag = string.Format("{0}: exit={1}, pdf미생성", Path.GetFileName(browserPath), proc.ExitCode);
                return false;
            }
        }

        private byte[] ConvertHtmlToPdfBytes(string html)
        {
            string workDir = Path.Combine(Path.GetTempPath(), "eduest_print_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(workDir);
            string htmlPath = Path.Combine(workDir, "exam.html");

            try
            {
                File.WriteAllText(htmlPath, html, new UTF8Encoding(false));
                string fileUri = new Uri(htmlPath).AbsoluteUri;

                // 1차 고속 경로: 상주 CDP 브라우저 (콜드 스타트 0ms)
                try
                {
                    byte[] cdpPdf = RenderHtmlViaCdp(fileUri);
                    if (cdpPdf != null && cdpPdf.Length > 0)
                        return cdpPdf;
                }
                catch
                {
                    lock (_cdpLock)
                    {
                        KillWarmBrowserLocked();
                    }
                    WarmUpBrowserAsync();
                }

                // 2차 폴백 경로: 기존 CLI headless 실행
                var browserPaths = FindHeadlessBrowserPaths();
                if (browserPaths.Count == 0)
                    throw new InvalidOperationException("HTML을 인쇄용 PDF로 변환할 Chrome 또는 Edge 브라우저를 찾을 수 없습니다.");

                string pdfPath = Path.Combine(workDir, "exam.pdf");
                string profileDir = Path.Combine(workDir, "profile");
                var diags = new List<string>();
                bool generated = false;

                foreach (string browserPath in browserPaths)
                {
                    string diag;
                    if (RunHeadlessPdfAttempt(browserPath, profileDir, pdfPath, fileUri, false, out diag))
                    {
                        generated = true;
                        break;
                    }
                    diags.Add(diag);

                    if (RunHeadlessPdfAttempt(browserPath, profileDir, pdfPath, fileUri, true, out diag))
                    {
                        generated = true;
                        break;
                    }
                    diags.Add(diag + "(shell)");
                }

                if (!generated || !File.Exists(pdfPath) || new FileInfo(pdfPath).Length == 0)
                    throw new InvalidOperationException("인쇄용 PDF 생성에 실패했습니다. (" + string.Join("; ", diags.ToArray()) + ")");

                return File.ReadAllBytes(pdfPath);
            }
            finally
            {
                try { Directory.Delete(workDir, true); } catch { }
            }
        }

        private int PrintHtmlSilently(string html, string printerName, string jobTitle, int copies, string duplex)
        {
            byte[] pdfBytes = ConvertHtmlToPdfBytes(html);
            return PrintPdfBytesSilently(pdfBytes, printerName, jobTitle, copies, duplex);
        }

        private static InMemoryRandomAccessStream CreatePdfStream(byte[] pdfBytes, out PdfDocument pdfDoc)
        {
            var memStream = new InMemoryRandomAccessStream();
            using (var writer = new DataWriter(memStream.GetOutputStreamAt(0)))
            {
                writer.WriteBytes(pdfBytes);
                WaitWinRT(writer.StoreAsync());
                WaitWinRT(writer.FlushAsync());
                writer.DetachStream();
            }
            memStream.Seek(0);
            pdfDoc = WaitWinRT(PdfDocument.LoadFromStreamAsync(memStream));
            return memStream;
        }

        private static byte[] RenderSinglePdfPageToBmpBytes(PdfPage pdfPage)
        {
            uint renderW = Math.Max(600u, (uint)Math.Round(pdfPage.Size.Width * RenderDpi / 96.0));
            uint renderH = Math.Max(800u, (uint)Math.Round(pdfPage.Size.Height * RenderDpi / 96.0));
            var opts = new PdfPageRenderOptions
            {
                DestinationWidth = renderW,
                DestinationHeight = renderH,
                BitmapEncoderId = BmpEncoderGuid,
                BackgroundColor = Windows.UI.Color.FromArgb(255, 255, 255, 255)
            };

            using (var memStream = new InMemoryRandomAccessStream())
            {
                WaitWinRTAction(pdfPage.RenderToStreamAsync(memStream, opts));
                uint imgSize = (uint)memStream.Size;
                byte[] bmpBytes = new byte[imgSize];
                using (var reader = new DataReader(memStream.GetInputStreamAt(0)))
                {
                    WaitWinRT(reader.LoadAsync(imgSize));
                    reader.ReadBytes(bmpBytes);
                }
                return bmpBytes;
            }
        }

        private static byte[][] RenderAllPdfPagesToBmpBytes(byte[] pdfBytes)
        {
            PdfDocument pdfDoc;
            using (CreatePdfStream(pdfBytes, out pdfDoc))
            {
                int totalPages = (int)pdfDoc.PageCount;
                if (totalPages <= 0)
                    throw new InvalidOperationException("인쇄할 페이지가 없습니다.");

                var results = new byte[totalPages][];
                int concurrency = Math.Min(4, Math.Max(1, Environment.ProcessorCount));
                var docLock = new object();

                Parallel.For(0, totalPages, new ParallelOptions { MaxDegreeOfParallelism = concurrency }, i =>
                {
                    PdfPage page;
                    lock (docLock)
                    {
                        page = pdfDoc.GetPage((uint)i);
                    }
                    using (page)
                    {
                        results[i] = RenderSinglePdfPageToBmpBytes(page);
                    }
                });

                return results;
            }
        }

        private static PrintDocument CreateConfiguredPrintDocument(string printerName, string jobTitle, int copies, string duplex)
        {
            var pd = new PrintDocument();
            pd.DocumentName = jobTitle;
            pd.PrintController = new StandardPrintController();
            pd.PrinterSettings.PrinterName = printerName;
            if (!pd.PrinterSettings.IsValid)
            {
                pd.Dispose();
                throw new InvalidOperationException("유효하지 않은 프린터입니다: " + printerName);
            }

            pd.PrinterSettings.Copies = (short)copies;

            if (!string.IsNullOrEmpty(duplex))
            {
                string d = duplex.ToLowerInvariant();
                if (d == "simplex") pd.PrinterSettings.Duplex = Duplex.Simplex;
                else if (d == "long" && pd.PrinterSettings.CanDuplex) pd.PrinterSettings.Duplex = Duplex.Vertical;
                else if (d == "short" && pd.PrinterSettings.CanDuplex) pd.PrinterSettings.Duplex = Duplex.Horizontal;
            }

            foreach (PaperSize ps in pd.PrinterSettings.PaperSizes)
            {
                if (ps.Kind == PaperKind.A4)
                {
                    pd.DefaultPageSettings.PaperSize = ps;
                    break;
                }
            }

            return pd;
        }

        private static void DrawBmpBytesToGraphics(byte[] bmpBytes, PrintPageEventArgs ev)
        {
            using (var netStream = new MemoryStream(bmpBytes))
            using (var bmp = new Bitmap(netStream))
            {
                ev.Graphics.InterpolationMode = InterpolationMode.HighQualityBilinear;
                ev.Graphics.SmoothingMode = SmoothingMode.HighSpeed;
                ev.Graphics.PixelOffsetMode = PixelOffsetMode.HighSpeed;
                ev.Graphics.CompositingQuality = CompositingQuality.HighSpeed;

                // GDI+ 인쇄 하드웨어 여백 오프셋 보정 -> A4 물리 좌표 (0,0) 기준 1:1 정렬
                ev.Graphics.TranslateTransform(-ev.PageSettings.HardMarginX, -ev.PageSettings.HardMarginY);
                ev.Graphics.DrawImage(bmp, 0, 0, ev.PageBounds.Width, ev.PageBounds.Height);
            }
        }

        private int PrintHtmlBatchSilently(PrintHtmlBatchRequest req, string printerName, int copies)
        {
            // 2페이지~끝 공유 페이지는 단 1회만 PDF 변환 + BMP 래스터화
            byte[][] sharedRestBmps = null;
            if (!string.IsNullOrWhiteSpace(req.SharedRestHtml))
            {
                byte[] restPdf = ConvertHtmlToPdfBytes(req.SharedRestHtml);
                sharedRestBmps = RenderAllPdfPagesToBmpBytes(restPdf);
            }

            int totalPrintedPages = 0;
            int restCount = sharedRestBmps != null ? sharedRestBmps.Length : 0;

            foreach (var job in req.Jobs)
            {
                byte[][] firstPageBmps = null;
                if (job != null && !string.IsNullOrWhiteSpace(job.FirstSheetHtml))
                {
                    byte[] firstPdf = ConvertHtmlToPdfBytes(job.FirstSheetHtml);
                    firstPageBmps = RenderAllPdfPagesToBmpBytes(firstPdf);
                }

                int firstCount = firstPageBmps != null ? firstPageBmps.Length : 0;
                int jobPageCount = firstCount + restCount;
                if (jobPageCount == 0) continue;

                string title = (job != null && !string.IsNullOrWhiteSpace(job.JobTitle)) ? job.JobTitle : "Eduest Exam Print";

                lock (_printLock)
                {
                    using (var pd = CreateConfiguredPrintDocument(printerName, title, copies, req.Duplex))
                    {
                        int pageIdx = 0;
                        pd.PrintPage += (s, ev) =>
                        {
                            if (pageIdx >= jobPageCount)
                            {
                                ev.HasMorePages = false;
                                return;
                            }

                            byte[] bmpBytes = pageIdx < firstCount
                                ? firstPageBmps[pageIdx]
                                : sharedRestBmps[pageIdx - firstCount];

                            DrawBmpBytesToGraphics(bmpBytes, ev);

                            pageIdx++;
                            ev.HasMorePages = pageIdx < jobPageCount;
                        };
                        pd.Print();
                    }
                }

                totalPrintedPages += jobPageCount;
            }

            return totalPrintedPages;
        }

        private int PrintPdfBytesSilently(byte[] pdfBytes, string printerName, string jobTitle, int copies, string duplex)
        {
            lock (_printLock)
            {
                PdfDocument pdfDoc;
                using (CreatePdfStream(pdfBytes, out pdfDoc))
                {
                    int totalPages = (int)pdfDoc.PageCount;
                    if (totalPages == 0)
                        throw new InvalidOperationException("인쇄할 페이지가 없습니다.");

                    // 최대 4페이지 선행 병렬 렌더링 버퍼 (메모리 절약 + 즉시 첫 장 스풀 시작)
                    var pageSlots = new byte[totalPages][];
                    var readyEvents = new ManualResetEventSlim[totalPages];
                    for (int i = 0; i < totalPages; i++)
                    {
                        readyEvents[i] = new ManualResetEventSlim(false);
                    }

                    Exception renderError = null;
                    int concurrency = Math.Min(4, Math.Max(1, Environment.ProcessorCount));
                    var docLock = new object();

                    var producerTask = Task.Factory.StartNew(() =>
                    {
                        try
                        {
                            using (var lookaheadThrottle = new SemaphoreSlim(concurrency))
                            {
                                var tasks = new List<Task>(totalPages);
                                for (int idx = 0; idx < totalPages; idx++)
                                {
                                    lookaheadThrottle.Wait();
                                    int pageNum = idx;
                                    tasks.Add(Task.Factory.StartNew(() =>
                                    {
                                        try
                                        {
                                            PdfPage page;
                                            lock (docLock)
                                            {
                                                page = pdfDoc.GetPage((uint)pageNum);
                                            }
                                            using (page)
                                            {
                                                pageSlots[pageNum] = RenderSinglePdfPageToBmpBytes(page);
                                            }
                                        }
                                        catch (Exception ex)
                                        {
                                            Interlocked.CompareExchange(ref renderError, ex, null);
                                        }
                                        finally
                                        {
                                            readyEvents[pageNum].Set();
                                            lookaheadThrottle.Release();
                                        }
                                    }));
                                }
                                Task.WaitAll(tasks.ToArray());
                            }
                        }
                        catch (Exception ex)
                        {
                            Interlocked.CompareExchange(ref renderError, ex, null);
                            for (int i = 0; i < totalPages; i++) readyEvents[i].Set();
                        }
                    });

                    try
                    {
                        using (var pd = CreateConfiguredPrintDocument(printerName, jobTitle, copies, duplex))
                        {
                            int pageIndex = 0;
                            pd.PrintPage += (s, ev) =>
                            {
                                if (pageIndex >= totalPages)
                                {
                                    ev.HasMorePages = false;
                                    return;
                                }

                                readyEvents[pageIndex].Wait();
                                if (renderError != null)
                                    throw new InvalidOperationException("PDF 페이지 렌더링 오류: " + renderError.Message, renderError);

                                byte[] bmpBytes = pageSlots[pageIndex];
                                pageSlots[pageIndex] = null; // 스풀 완료 후 즉시 GC 회수 가능
                                DrawBmpBytesToGraphics(bmpBytes, ev);

                                pageIndex++;
                                ev.HasMorePages = pageIndex < totalPages;
                            };

                            pd.Print();
                        }

                        producerTask.Wait();
                        if (renderError != null)
                            throw new InvalidOperationException("PDF 페이지 렌더링 오류: " + renderError.Message, renderError);

                        return totalPages;
                    }
                    finally
                    {
                        try { producerTask.Wait(2000); } catch { }
                        for (int i = 0; i < totalPages; i++)
                        {
                            try { readyEvents[i].Dispose(); } catch { }
                        }
                    }
                }
            }
        }

        private static T WaitWinRT<T>(IAsyncOperation<T> op)
        {
            using (var mre = new ManualResetEventSlim(false))
            {
                op.Completed = (info, status) => mre.Set();
                mre.Wait();
                return op.GetResults();
            }
        }

        private static void WaitWinRTAction(IAsyncAction op)
        {
            using (var mre = new ManualResetEventSlim(false))
            {
                op.Completed = (info, status) => mre.Set();
                mre.Wait();
                op.GetResults();
            }
        }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool DestroyIcon(IntPtr hIcon);

        private static Icon CreatePrinterTrayIcon()
        {
            using (var bmp = new Bitmap(32, 32, PixelFormat.Format32bppArgb))
            using (var g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.Clear(Color.Transparent);

                // 보라색 둥근 사각형 배지
                using (var bgBrush = new LinearGradientBrush(new Rectangle(0, 0, 32, 32), Color.FromArgb(124, 58, 237), Color.FromArgb(79, 70, 229), 45f))
                using (var path = CreateRoundRect(new Rectangle(1, 1, 30, 30), 7))
                {
                    g.FillPath(bgBrush, path);
                }

                // 흰색 프린터 심볼
                using (var white = new SolidBrush(Color.White))
                using (var paper = new SolidBrush(Color.FromArgb(224, 231, 255)))
                using (var dot = new SolidBrush(Color.FromArgb(52, 211, 153)))
                {
                    // 상단 용지
                    g.FillRectangle(paper, 10, 5, 12, 6);
                    // 본체
                    g.FillRectangle(white, 6, 11, 20, 10);
                    // 상태 LED 점
                    g.FillEllipse(dot, 21, 13, 3, 3);
                    // 출력 용지
                    g.FillRectangle(paper, 10, 18, 12, 8);
                }

                IntPtr hIcon = bmp.GetHicon();
                try
                {
                    using (var temp = Icon.FromHandle(hIcon))
                    {
                        return (Icon)temp.Clone();
                    }
                }
                finally
                {
                    DestroyIcon(hIcon);
                }
            }
        }

        private static GraphicsPath CreateRoundRect(Rectangle rect, int radius)
        {
            int d = radius * 2;
            var path = new GraphicsPath();
            path.AddArc(rect.X, rect.Y, d, d, 180, 90);
            path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
            path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
            path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }
    }

    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            bool createdNew;
            using (var mutex = new Mutex(true, @"Global\EduestPrinterBridge_SingleInstance_48921", out createdNew))
            {
                if (!createdNew)
                {
                    MessageBox.Show(
                        "Eduest 프린터 브릿지가 이미 백그라운드에서 실행 중입니다.\n윈도우 작업표시줄 오른쪽(시스템 트레이)을 확인해 주세요.",
                        "Eduest 프린터 브릿지",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                using (var ctx = new TrayBridgeContext())
                {
                    Application.Run(ctx);
                }
            }
        }
    }
}
