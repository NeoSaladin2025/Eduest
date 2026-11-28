using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Printing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;
using Windows.Data.Pdf;
using Windows.Foundation;
using Windows.Storage;
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
        private const string BridgeVersion = "1.0.0";
        private const string RunRegistryPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string RunRegistryKey = "EduestPrinterBridge";

        private readonly NotifyIcon _trayIcon;
        private readonly ToolStripMenuItem _statusMenuItem;
        private readonly ToolStripMenuItem _autoStartMenuItem;
        private readonly HttpListener _listener;
        private readonly Thread _serverThread;
        private readonly object _printLock = new object();
        private volatile bool _running = true;

        public TrayBridgeContext()
        {
            _statusMenuItem = new ToolStripMenuItem("상태: 127.0.0.1:" + BridgePort + " 대기 중")
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

            RefreshPrintersNotification(false);
            _trayIcon.ShowBalloonTip(
                3500,
                "Eduest 프린터 브릿지 시작됨",
                "작업표시줄 오른쪽 트레이에서 백그라운드 실행 중입니다. 시험지 인쇄 화면에서 프린터를 바로 선택할 수 있습니다.",
                ToolTipIcon.Info
            );
        }

        private void RefreshPrintersNotification(bool showBalloon)
        {
            int count = PrinterSettings.InstalledPrinters.Count;
            string defaultPrinter = GetDefaultPrinterName();
            string tip = string.Format("Eduest 프린터 브릿지 ({0}대 감지)", count);
            if (tip.Length > 63) tip = tip.Substring(0, 63);
            _trayIcon.Text = tip;
            _statusMenuItem.Text = string.Format("실행 중 (127.0.0.1:{0} · {1}대)", BridgePort, count);

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
            sb.AppendLine("Eduest 프린터 브릿지 v" + BridgeVersion);
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
                        "{{\"ok\":true,\"defaultPrinter\":{0},\"printers\":[{1}]}}",
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

        private static string FindHeadlessBrowserPath()
        {
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string[] candidates = new[]
            {
                @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files\Google\Chrome\Application\chrome.exe",
                @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                Path.Combine(localAppData, @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(localAppData, @"Google\Chrome\Application\chrome.exe"),
            };
            foreach (string c in candidates)
            {
                if (!string.IsNullOrEmpty(c) && File.Exists(c)) return c;
            }
            return null;
        }

        private int PrintHtmlSilently(string html, string printerName, string jobTitle, int copies, string duplex)
        {
            string browserPath = FindHeadlessBrowserPath();
            if (string.IsNullOrEmpty(browserPath))
                throw new InvalidOperationException("HTML을 인쇄용 PDF로 변환할 Edge 또는 Chrome 브라우저를 찾을 수 없습니다.");

            string workDir = Path.Combine(Path.GetTempPath(), "eduest_print_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(workDir);
            string htmlPath = Path.Combine(workDir, "exam.html");
            string pdfPath = Path.Combine(workDir, "exam.pdf");
            string profileDir = Path.Combine(workDir, "profile");
            Directory.CreateDirectory(profileDir);

            try
            {
                File.WriteAllText(htmlPath, html, new UTF8Encoding(false));
                string fileUri = new Uri(htmlPath).AbsoluteUri;

                var psi = new ProcessStartInfo
                {
                    FileName = browserPath,
                    Arguments = string.Format(
                        "--headless=new --no-first-run --no-default-browser-check --no-pdf-header-footer --user-data-dir=\"{0}\" --print-to-pdf=\"{1}\" \"{2}\"",
                        profileDir, pdfPath, fileUri
                    ),
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };

                using (var proc = Process.Start(psi))
                {
                    if (proc == null)
                        throw new InvalidOperationException("헤드리스 인쇄 변환 프로세스를 시작하지 못했습니다.");
                    if (!proc.WaitForExit(45000))
                    {
                        try { proc.Kill(); } catch { }
                        throw new TimeoutException("시험지 PDF 변환 시간이 초과되었습니다.");
                    }
                }

                if (!File.Exists(pdfPath) || new FileInfo(pdfPath).Length == 0)
                    throw new InvalidOperationException("인쇄용 PDF 생성에 실패했습니다.");

                byte[] pdfBytes = File.ReadAllBytes(pdfPath);
                return PrintPdfBytesSilently(pdfBytes, printerName, jobTitle, copies, duplex);
            }
            finally
            {
                try { Directory.Delete(workDir, true); } catch { }
            }
        }

        private int PrintPdfBytesSilently(byte[] pdfBytes, string printerName, string jobTitle, int copies, string duplex)
        {
            string tempPdf = Path.Combine(Path.GetTempPath(), "eduest_job_" + Guid.NewGuid().ToString("N") + ".pdf");
            try
            {
                File.WriteAllBytes(tempPdf, pdfBytes);

                lock (_printLock)
                {
                    var storageFile = WaitWinRT(StorageFile.GetFileFromPathAsync(tempPdf));
                    var pdfDoc = WaitWinRT(PdfDocument.LoadFromFileAsync(storageFile));
                    uint totalPages = pdfDoc.PageCount;
                    if (totalPages == 0)
                        throw new InvalidOperationException("인쇄할 페이지가 없습니다.");

                    using (var pd = new PrintDocument())
                    {
                        pd.DocumentName = jobTitle;
                        pd.PrintController = new StandardPrintController();
                        pd.PrinterSettings.PrinterName = printerName;
                        if (!pd.PrinterSettings.IsValid)
                            throw new InvalidOperationException("유효하지 않은 프린터입니다: " + printerName);

                        pd.PrinterSettings.Copies = (short)copies;

                        if (!string.IsNullOrEmpty(duplex))
                        {
                            string d = duplex.ToLowerInvariant();
                            if (d == "simplex") pd.PrinterSettings.Duplex = Duplex.Simplex;
                            else if (d == "long" && pd.PrinterSettings.CanDuplex) pd.PrinterSettings.Duplex = Duplex.Vertical;
                            else if (d == "short" && pd.PrinterSettings.CanDuplex) pd.PrinterSettings.Duplex = Duplex.Horizontal;
                        }

                        // A4 용지 크기가 지원되면 명시적으로 A4 매칭
                        foreach (PaperSize ps in pd.PrinterSettings.PaperSizes)
                        {
                            if (ps.Kind == PaperKind.A4)
                            {
                                pd.DefaultPageSettings.PaperSize = ps;
                                break;
                            }
                        }

                        uint pageIndex = 0;
                        pd.PrintPage += (s, ev) =>
                        {
                            if (pageIndex >= totalPages)
                            {
                                ev.HasMorePages = false;
                                return;
                            }

                            using (var pdfPage = pdfDoc.GetPage(pageIndex))
                            using (var memStream = new InMemoryRandomAccessStream())
                            {
                                // 300 DPI 고해상도 래스터화 (DIP 96DPI 기준 환산)
                                uint renderW = Math.Max(600u, (uint)Math.Round(pdfPage.Size.Width * 300.0 / 96.0));
                                uint renderH = Math.Max(800u, (uint)Math.Round(pdfPage.Size.Height * 300.0 / 96.0));
                                var opts = new PdfPageRenderOptions
                                {
                                    DestinationWidth = renderW,
                                    DestinationHeight = renderH,
                                    BackgroundColor = Windows.UI.Color.FromArgb(255, 255, 255, 255)
                                };
                                WaitWinRTAction(pdfPage.RenderToStreamAsync(memStream, opts));
                                uint imgSize = (uint)memStream.Size;
                                byte[] pngBytes = new byte[imgSize];
                                using (var reader = new DataReader(memStream.GetInputStreamAt(0)))
                                {
                                    WaitWinRT(reader.LoadAsync(imgSize));
                                    reader.ReadBytes(pngBytes);
                                }

                                using (var netStream = new MemoryStream(pngBytes))
                                using (var bmp = new Bitmap(netStream))
                                {
                                    ev.Graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
                                    ev.Graphics.SmoothingMode = SmoothingMode.HighQuality;
                                    ev.Graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;

                                    // GDI+ 인쇄 하드웨어 여백 오프셋 보정 -> A4 물리 좌표 (0,0) 기준 1:1 정렬
                                    ev.Graphics.TranslateTransform(-ev.PageSettings.HardMarginX, -ev.PageSettings.HardMarginY);
                                    ev.Graphics.DrawImage(bmp, 0, 0, ev.PageBounds.Width, ev.PageBounds.Height);
                                }
                            }

                            pageIndex++;
                            ev.HasMorePages = pageIndex < totalPages;
                        };

                        pd.Print();
                    }

                    return (int)totalPages;
                }
            }
            finally
            {
                try { if (File.Exists(tempPdf)) File.Delete(tempPdf); } catch { }
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
