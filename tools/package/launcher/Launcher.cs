// HWR-App.exe: starts the game server from the portable folder and lives in the system tray.
// Compiled by tools/package/package-win.mjs with the C# compiler that ships with Windows.
//
// The server runs hidden, writing to server.log beside the saves in %LOCALAPPDATA%\HWR-App, so
// replacing this folder never loses a campaign. The host console and the TV view open as Edge
// app windows (their own taskbar entries, no address bar). The tray menu opens them again,
// copies the join link and quits. A Windows job object ties the server to this launcher, so
// the server can never be left running after the launcher has gone.
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

static class Launcher
{
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    static extern bool SetProcessDPIAware();

    [STAThread]
    static int Main(string[] args)
    {
        // Real pixel coordinates for the screens, so the TV view lands on the TV at any display scaling.
        SetProcessDPIAware();
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        string root = AppDomain.CurrentDomain.BaseDirectory;
        // HWR_LAUNCHER_DATA lets tests run a copy without touching the real saves.
        string data = Environment.GetEnvironmentVariable("HWR_LAUNCHER_DATA") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HWR-App");
        Directory.CreateDirectory(data);

        // One copy at a time: a second double-click just brings up the host console again.
        bool first;
        using (var mutex = new Mutex(true, "HWR-App.Launcher", out first))
        {
            if (!first)
            {
                int running = TrayApp.ReadPort(data);
                if (running > 0) TrayApp.OpenWindow(data, running, "/host");
                else MessageBox.Show("HWR-App is already starting. It will open in a moment.", "HWR-App", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return 0;
            }
            if (!File.Exists(Path.Combine(root, "runtime", "node.exe")) || !File.Exists(Path.Combine(root, "app", "server.mjs")))
            {
                MessageBox.Show("This folder is incomplete: runtime\\node.exe or app\\server.mjs is missing.\n\nRebuild it with: corepack pnpm package:win", "HWR-App", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
            var app = new TrayApp(root, data, Array.IndexOf(args, "--no-browser") < 0);
            Application.Run(app);
            return app.ExitCode;
        }
    }
}

class TrayApp : ApplicationContext
{
    readonly string root, data, logPath;
    readonly bool openBrowser;
    readonly NotifyIcon tray;
    readonly ToolStripMenuItem openHost, openTv, copyLink;
    readonly Control ui = new Control();
    readonly object logLock = new object();
    StreamWriter log;
    Process server;
    int port;
    bool quitting;
    public int ExitCode;

    public TrayApp(string root, string data, bool openBrowser)
    {
        this.root = root;
        this.data = data;
        this.openBrowser = openBrowser;
        logPath = Path.Combine(data, "server.log");
        ui.CreateControl();

        var menu = new ContextMenuStrip();
        openHost = new ToolStripMenuItem("Open host console", null, (s, e) => OpenWindow(data, port, "/host")) { Enabled = false };
        openHost.Font = new Font(openHost.Font, FontStyle.Bold);
        openTv = new ToolStripMenuItem("Open TV view", null, (s, e) => OpenTv()) { Enabled = false };
        copyLink = new ToolStripMenuItem("Copy join link", null, (s, e) => CopyJoinLink()) { Enabled = false };
        menu.Items.Add(openHost);
        menu.Items.Add(openTv);
        menu.Items.Add(copyLink);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("Add desktop and Start menu shortcuts", null, (s, e) => { Shortcuts.Create(); Remember("yes"); Balloon("Shortcuts added", "HWR-App is on your desktop and in the Start menu."); }));
        menu.Items.Add(new ToolStripMenuItem("Show server log", null, (s, e) => Shell(logPath)));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("Quit HWR-App", null, (s, e) => Quit()));

        tray = new NotifyIcon
        {
            Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location),
            Text = "HWR-App: starting...",
            ContextMenuStrip = menu,
            Visible = true,
        };
        tray.DoubleClick += (s, e) => { if (port > 0 && openHost.Enabled) OpenWindow(data, port, "/host"); };
        Application.ApplicationExit += (s, e) => StopServer();

        StartServer();
    }

    // ---------------------------------------------------------------- the server

    void StartServer()
    {
        port = FreePort(8787, 8799);
        try
        {
            log = new StreamWriter(logPath, false) { AutoFlush = true };
            log.WriteLine("HWR-App: starting the game server on port " + port + " at " + DateTime.Now);
        }
        catch (IOException)
        {
            log = null; // Another copy has the log open; carry on without one.
        }

        var start = new ProcessStartInfo
        {
            FileName = Path.Combine(root, "runtime", "node.exe"),
            Arguments = "--env-file-if-exists=\"" + Path.Combine(data, ".env") + "\" \"" + Path.Combine(root, "app", "server.mjs") + "\"",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            WorkingDirectory = root,
        };
        start.EnvironmentVariables["PORT"] = port.ToString();
        start.EnvironmentVariables["HWR_WEB_DIST"] = Path.Combine(root, "app", "web");
        start.EnvironmentVariables["HWR_PRIVATE_DIR"] = Path.Combine(root, "private");
        start.EnvironmentVariables["HWR_DATA"] = Path.Combine(data, "hwr.sqlite");
        start.EnvironmentVariables["HWR_LOG_LEVEL"] = "warn";

        try
        {
            server = Process.Start(start);
        }
        catch (Exception e)
        {
            Fail("Couldn't start the game server: " + e.Message);
            return;
        }
        Job.Adopt(server);
        server.OutputDataReceived += (s, e) => Log(e.Data);
        server.ErrorDataReceived += (s, e) => Log(e.Data);
        server.BeginOutputReadLine();
        server.BeginErrorReadLine();
        server.EnableRaisingEvents = true;
        server.Exited += (s, e) => ui.BeginInvoke((Action)ServerExited);

        ThreadPool.QueueUserWorkItem(_ =>
        {
            bool ready = WaitForServer();
            ui.BeginInvoke((Action)(() => { if (ready) Ready(); }));
        });
    }

    /// Up to three minutes: on a laptop's first run, antivirus can hold a new node.exe for a while.
    bool WaitForServer()
    {
        for (int i = 0; i < 360 && !server.HasExited; i++)
        {
            if (i == 20) ui.BeginInvoke((Action)(() => Balloon("Still starting", "The first run can take a minute or two while antivirus checks the program. If it asks, allow HWR-App.")));
            try
            {
                var req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/api/health");
                req.Timeout = 1000;
                using (var res = (HttpWebResponse)req.GetResponse())
                    if (res.StatusCode == HttpStatusCode.OK) return true;
            }
            catch (WebException) { }
            Thread.Sleep(500);
        }
        return false;
    }

    void Ready()
    {
        File.WriteAllText(Path.Combine(data, "launcher.port"), port.ToString());
        tray.Text = "HWR-App: ready on port " + port;
        openHost.Enabled = openTv.Enabled = copyLink.Enabled = true;
        if (!openBrowser) return; // --no-browser: started by a script, so no windows and no questions.
        OpenWindow(data, port, "/host");
        if (Screen.AllScreens.Length > 1) OpenTv();
        Balloon("HWR-App is ready", Screen.AllScreens.Length > 1
            ? "The host console is open here and the TV view is on the TV. Right-click the emblem in the tray for more."
            : "The host console is open. Plug in the TV and the story appears on it by itself.");
        // Plugging the TV in later (or switching Windows+P to Extend) puts the TV view on it too.
        SystemEvents.DisplaySettingsChanged += (s, e) => ui.BeginInvoke((Action)(() =>
        {
            if (Screen.AllScreens.Length > 1 && (tv == null || tv.HasExited)) OpenTv();
        }));
        OfferShortcuts();
    }

    Process tv;

    /// The TV view, full screen on the second screen when there is one (otherwise a normal window).
    /// It follows the table selected on the host console, so it only ever needs opening once.
    void OpenTv()
    {
        if (port <= 0) return;
        Screen other = null;
        foreach (var s in Screen.AllScreens) if (!s.Primary) { other = s; break; }
        string edge = FindEdge();
        if (edge == null || other == null)
        {
            OpenWindow(data, port, "/tv");
            return;
        }
        // A profile of its own makes this a separate Edge, so it honours the position and full
        // screen even while the host console's window is already open.
        var b = other.Bounds;
        string args = "--app=\"http://localhost:" + port + "/tv\" --user-data-dir=\"" + Path.Combine(data, "browser-tv") + "\"" +
            " --no-first-run --no-default-browser-check --autoplay-policy=no-user-gesture-required" +
            " --window-position=" + (b.X + b.Width / 4) + "," + (b.Y + b.Height / 4) + " --window-size=" + (b.Width / 2) + "," + (b.Height / 2) + " --start-fullscreen";
        try { tv = Process.Start(new ProcessStartInfo(edge, args) { UseShellExecute = false }); } catch (Exception) { OpenWindow(data, port, "/tv"); }
    }

    void ServerExited()
    {
        if (quitting) return;
        ExitCode = server.ExitCode;
        if (server.ExitCode != 0)
            MessageBox.Show("The game server stopped (exit code " + server.ExitCode + "). Saves are kept.\n\nThe log is at:\n" + logPath, "HWR-App", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        // Exit code 0 is the host console's Quit button: leave quietly.
        Close();
    }

    void Quit()
    {
        quitting = true;
        // Ask the server to stop cleanly so the last moves are saved; force it after a few seconds.
        try
        {
            var req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/api/host/quit");
            req.Method = "POST";
            req.Timeout = 2000;
            req.ContentLength = 0;
            using (req.GetResponse()) { }
        }
        catch (WebException) { }
        if (server != null && !server.WaitForExit(4000)) StopServer();
        Close();
    }

    void StopServer()
    {
        try { if (server != null && !server.HasExited) server.Kill(); } catch (InvalidOperationException) { }
    }

    void Close()
    {
        tray.Visible = false;
        try { File.Delete(Path.Combine(data, "launcher.port")); } catch (IOException) { }
        ExitThread();
    }

    void Fail(string message)
    {
        MessageBox.Show(message, "HWR-App", MessageBoxButtons.OK, MessageBoxIcon.Error);
        ExitCode = 1;
        Close();
    }

    void Log(string line)
    {
        if (line == null || log == null) return;
        lock (logLock) log.WriteLine(line);
    }

    // ---------------------------------------------------------------- tray actions

    void CopyJoinLink()
    {
        try
        {
            using (var web = new WebClient())
            {
                string json = web.DownloadString("http://127.0.0.1:" + port + "/api/host/join-link");
                var m = Regex.Match(json, "\"url\":\"([^\"]+)\"");
                if (!m.Success) return;
                Clipboard.SetText(m.Groups[1].Value);
                Balloon("Join link copied", m.Groups[1].Value);
            }
        }
        catch (WebException) { }
    }

    void Balloon(string title, string text)
    {
        tray.ShowBalloonTip(5000, title, text, ToolTipIcon.Info);
    }

    /// Asks once whether to add shortcuts; after a yes, refreshes them each start in case the folder moved.
    void OfferShortcuts()
    {
        string choice = Path.Combine(data, "shortcuts.choice");
        string answer = File.Exists(choice) ? File.ReadAllText(choice).Trim() : "";
        if (answer == "yes") { Shortcuts.Create(); return; }
        if (answer == "no") return;
        var result = MessageBox.Show("Add HWR-App to your desktop and Start menu?\n\nNothing is installed: the shortcuts point at this folder. You can add them later from the tray menu.", "HWR-App", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
        if (result == DialogResult.Yes) Shortcuts.Create();
        Remember(result == DialogResult.Yes ? "yes" : "no");
    }

    void Remember(string answer)
    {
        File.WriteAllText(Path.Combine(data, "shortcuts.choice"), answer);
    }

    static void Shell(string path)
    {
        try { Process.Start(new ProcessStartInfo(path) { UseShellExecute = true }); } catch (Exception) { }
    }

    // ---------------------------------------------------------------- shared helpers

    public static int ReadPort(string data)
    {
        try { return int.Parse(File.ReadAllText(Path.Combine(data, "launcher.port")).Trim()); } catch (Exception) { return 0; }
    }

    /// Opens a page as an Edge app window: its own taskbar entry with the game's icon, no address bar.
    /// The windows share a profile beside the saves, which lets narration and music play without a click.
    public static void OpenWindow(string data, int port, string path)
    {
        string url = "http://localhost:" + port + path;
        string edge = FindEdge();
        if (edge == null)
        {
            Shell(url); // No Edge: the default browser, in a tab.
            return;
        }
        string size = path == "/host" ? " --window-size=1400,900" : "";
        Process.Start(new ProcessStartInfo(edge,
            "--app=\"" + url + "\" --user-data-dir=\"" + Path.Combine(data, "browser") + "\" --no-first-run --no-default-browser-check --autoplay-policy=no-user-gesture-required" + size)
        { UseShellExecute = false });
    }

    static string FindEdge()
    {
        var registered = Registry.GetValue(@"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe", "", null) as string;
        if (registered != null && File.Exists(registered)) return registered;
        foreach (var folder in new[] { Environment.SpecialFolder.ProgramFilesX86, Environment.SpecialFolder.ProgramFiles })
        {
            string candidate = Path.Combine(Environment.GetFolderPath(folder), @"Microsoft\Edge\Application\msedge.exe");
            if (File.Exists(candidate)) return candidate;
        }
        return null;
    }

    /// The first free port in the range, so a second copy or another app on 8787 doesn't clash.
    static int FreePort(int from, int to)
    {
        for (int p = from; p <= to; p++)
        {
            try
            {
                var l = new TcpListener(IPAddress.Any, p);
                l.Start();
                l.Stop();
                return p;
            }
            catch (SocketException) { }
        }
        return from;
    }
}

/// Desktop and Start menu shortcuts to this copy of HWR-App.exe, made with the Windows Script Host.
static class Shortcuts
{
    public static void Create()
    {
        string exe = Assembly.GetExecutingAssembly().Location;
        Make(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "HWR-App.lnk"), exe);
        Make(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "HWR-App.lnk"), exe);
    }

    static void Make(string lnk, string exe)
    {
        try
        {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            object shell = Activator.CreateInstance(shellType);
            object link = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { lnk });
            Type linkType = link.GetType();
            linkType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, link, new object[] { exe });
            linkType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, link, new object[] { Path.GetDirectoryName(exe) });
            linkType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, link, new object[] { exe + ",0" });
            linkType.InvokeMember("Description", BindingFlags.SetProperty, null, link, new object[] { "Homeworld: Revelations at the table" });
            linkType.InvokeMember("Save", BindingFlags.InvokeMethod, null, link, null);
        }
        catch (Exception) { } // A locked-down PC may refuse; the tray menu can try again.
    }
}

/// A Windows job object that kills the server when the launcher closes, however it closes.
static class Job
{
    static IntPtr handle;

    public static void Adopt(Process process)
    {
        try
        {
            if (handle == IntPtr.Zero)
            {
                handle = CreateJobObject(IntPtr.Zero, null);
                var info = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
                info.BasicLimitInformation.LimitFlags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
                int length = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
                IntPtr ptr = Marshal.AllocHGlobal(length);
                Marshal.StructureToPtr(info, ptr, false);
                SetInformationJobObject(handle, 9, ptr, (uint)length); // JobObjectExtendedLimitInformation
                Marshal.FreeHGlobal(ptr);
            }
            AssignProcessToJobObject(handle, process.Handle);
        }
        catch (Exception) { } // Without the job, Quit and closing still stop the server.
    }

    [StructLayout(LayoutKind.Sequential)]
    struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct IO_COUNTERS
    {
        public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount, ReadTransferCount, WriteTransferCount, OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr CreateJobObject(IntPtr attributes, string name);

    [DllImport("kernel32.dll")]
    static extern bool SetInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint length);

    [DllImport("kernel32.dll")]
    static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
}
