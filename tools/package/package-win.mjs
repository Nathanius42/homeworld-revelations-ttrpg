/**
 * Builds the portable Windows folder (story #536): double-click HWR-App.exe on a laptop with no
 * dev tools. CI never runs it. The default build carries the private folder and is for this
 * household's own machines only; a --no-private build is the one shared on GitHub releases.
 *
 *   corepack pnpm package:win [--no-private] [--out <folder>]
 *
 * Writes (default dist/HWR-App, git-ignored):
 *   HWR-App.exe        launcher (tools/package/launcher/Launcher.cs)
 *   runtime/node.exe   this PC's Node 24 (node:sqlite needs 22.5+)
 *   app/server.mjs     the server and packages, bundled by esbuild
 *   app/web/           the built web client
 *   app/node_modules/  the Kokoro voice engine (native, so it can't be bundled)
 *   private/           ships, portraits, music, sfx, missions and tts from reference/ (unless --no-private)
 *   README.txt
 *   Start without launcher.cmd   the same start as a readable script, for PCs that block the unsigned launcher
 *   LICENSE.txt, THIRD-PARTY-NOTICES.txt   (--no-private builds, which may be shared)
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const noPrivate = args.includes("--no-private");
const outArg = args.indexOf("--out");
const out = resolve(outArg >= 0 ? args[outArg + 1] : join(root, "dist", "HWR-App"));
const CSC = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe";
/** Only what the running app reads; likeness work, art references and the corebook stay behind. */
const PRIVATE_KINDS = ["ships", "portraits", "music", "sfx", "missions", "tts", "badges"];
/** Loaded at run time rather than bundled: onnxruntime is a native module, and kokoro-js reads its voices from its own folder. */
const EXTERNAL = ["kokoro-js", "@huggingface/transformers"];

const step = (msg) => console.log(`> ${msg}`);

/**
 * The folder of package `name` as Node would find it from `from`: the nearest node_modules/<name>
 * going up. pnpm keeps each package's dependencies beside it. Looking at folders rather than
 * calling require.resolve copes with packages whose exports hide package.json (sharp's binaries).
 * Null for an optional dependency that isn't installed, such as another platform's binary.
 */
function packageDir(name, from) {
  for (let dir = from; ; dir = dirname(dir)) {
    if (basename(dir) !== "node_modules") {
      const candidate = join(dir, "node_modules", name);
      if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate);
    }
    if (dirname(dir) === dir) return null;
  }
}

/** Copies the packages and everything they depend on into one flat node_modules. */
function copyDependencies(names, from, dest) {
  const seen = new Set();
  const visit = (name, base) => {
    if (seen.has(name)) return;
    seen.add(name);
    const dir = packageDir(name, base);
    if (!dir) return;
    // onnxruntime-node ships binaries for every platform; the laptop only needs Windows x64.
    const filter = name === "onnxruntime-node" ? (src) => !/[\\/]bin[\\/]napi-v\d+[\\/](?!win32)/.test(src) && !/[\\/]bin[\\/]napi-v\d+[\\/]win32[\\/](?!x64)/.test(src) : undefined;
    cpSync(dir, join(dest, name), { recursive: true, dereference: true, filter });
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) visit(dep, dir);
  };
  for (const name of names) visit(name, from);
}
const size = (dir) => readdirSync(dir, { withFileTypes: true, recursive: true }).filter((e) => e.isFile()).reduce((n, e) => n + statSync(join(e.parentPath, e.name)).size, 0);

if (process.platform !== "win32") throw new Error("The portable build is for Windows.");
const [major] = process.versions.node.split(".").map(Number);
if (major < 22) throw new Error(`Node ${process.version} is too old; the server needs node:sqlite (22.5+).`);

step(`Cleaning ${out}`);
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "app"), { recursive: true });
mkdirSync(join(out, "runtime"), { recursive: true });

step("Building the web client");
// corepack is a .cmd shim on Windows, so run it through cmd rather than spawning it directly.
execFileSync("cmd", ["/c", "corepack", "pnpm", "--filter", "@hwr/web", "build"], { cwd: root, stdio: "inherit" });
cpSync(join(root, "apps", "web", "dist"), join(out, "app", "web"), { recursive: true });

step("Bundling the server");
await build({
  // The Kokoro worker is its own file beside the server: worker threads load a module by path.
  entryPoints: { server: join(root, "apps", "server", "src", "main.ts"), "tts-worker": join(root, "apps", "server", "src", "tts-worker.ts") },
  outdir: join(out, "app"),
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: EXTERNAL,
  // Some dependencies are CommonJS and call require(); give the ES module bundle one.
  banner: { js: "import { createRequire as __hwrRequire } from 'node:module'; const require = __hwrRequire(import.meta.url);" },
  logLevel: "warning",
});

step("Copying the Kokoro voice engine");
copyDependencies(EXTERNAL, join(root, "apps", "server"), join(out, "app", "node_modules"));

step(`Copying Node ${process.version}`);
cpSync(process.execPath, join(out, "runtime", "node.exe"));

// The private build wears the game's own Kushan badge (reference/branding, made from the game's
// badges/kushan.tga); otherwise the emblem drawn for the web client (tools/package/make-icon.mjs).
const branding = join(root, "reference", "branding");
const privateIcon = !noPrivate && existsSync(join(branding, "hwr.ico"));
const icon = privateIcon ? join(branding, "hwr.ico") : join(root, "tools", "package", "launcher", "hwr.ico");
if (privateIcon) {
  step("Using the Kushan badge from the private folder");
  cpSync(join(branding, "icon-256.png"), join(out, "app", "web", "icon-256.png"));
  // The app windows take the page's icon: drop the SVG emblem so they show the badge.
  const index = join(out, "app", "web", "index.html");
  writeFileSync(index, readFileSync(index, "utf8").replace(/\s*<link rel="icon" type="image\/svg\+xml"[^>]*>/, ""));
}

step("Compiling HWR-App.exe");
if (!existsSync(CSC)) throw new Error(`Can't find the C# compiler at ${CSC}.`);
// A Windows (not console) program: it lives in the tray, with the server hidden behind it.
execFileSync(
  CSC,
  [
    "/nologo",
    "/target:winexe",
    "/optimize+",
    `/win32icon:${icon}`,
    "/r:System.Windows.Forms.dll",
    "/r:System.Drawing.dll",
    `/out:${join(out, "HWR-App.exe")}`,
    join(root, "tools", "package", "launcher", "Launcher.cs"),
  ],
  { stdio: "inherit" },
);

if (noPrivate) {
  step("Leaving out the private folder (--no-private)");
  // A build that may be shared carries its licences: the project's own (the public repository's
  // LICENSE, kept in tools/public here) and a note for the software bundled with it.
  const license = [join(root, "LICENSE"), join(root, "tools", "public", "LICENSE")].find((f) => existsSync(f));
  if (license) cpSync(license, join(out, "LICENSE.txt"));
  writeFileSync(
    join(out, "THIRD-PARTY-NOTICES.txt"),
    [
      "Third-party software in this download",
      "",
      "runtime/node.exe",
      `  Node.js ${process.version}, (c) Node.js contributors, MIT licence and bundled third-party licences:`,
      `  https://github.com/nodejs/node/blob/${process.version}/LICENSE`,
      "",
      "app/node_modules",
      "  The Kokoro voice engine (kokoro-js, Apache 2.0), Hugging Face Transformers.js (Apache 2.0),",
      "  ONNX Runtime (MIT) and their dependencies. Each package's licence is in its own folder.",
      "",
      "app/server.mjs and app/web",
      "  Bundled open-source libraries including React, three.js, Fastify, ws and the Anthropic SDK,",
      "  each under its own licence (MIT unless stated otherwise in the source repository's lockfile).",
      "",
      "HWR-App's own code is MIT licensed (LICENSE.txt). Homeworld and Homeworld: Revelations belong",
      "to Gearbox Software and Modiphius Entertainment; this is an unofficial, non-commercial fan project.",
      "",
    ].join("\r\n"),
  );
} else {
  for (const kind of PRIVATE_KINDS) {
    const src = join(root, "reference", kind);
    if (!existsSync(src)) continue;
    step(`Copying private ${kind}`);
    cpSync(src, join(out, "private", kind), { recursive: true });
  }
}

// The same start as the launcher, as a script anyone can read: for PCs whose antivirus or
// SmartScreen won't run the unsigned HWR-App.exe. The server's window stays open; closing it stops the game.
writeFileSync(
  join(out, "Start without launcher.cmd"),
  [
    "@echo off",
    "rem Starts HWR-App without HWR-App.exe: the game server in this window, the host console in your browser.",
    "rem Close this window to stop the game. Saves and settings: %LOCALAPPDATA%\\HWR-App",
    'cd /d "%~dp0"',
    'set "HWR_WEB_DIST=%~dp0app\\web"',
    'set "HWR_PRIVATE_DIR=%~dp0private"',
    'set "HWR_DATA=%LOCALAPPDATA%\\HWR-App\\hwr.sqlite"',
    'if not exist "%LOCALAPPDATA%\\HWR-App" mkdir "%LOCALAPPDATA%\\HWR-App"',
    'start "" cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:8787/host"',
    'runtime\\node.exe --env-file-if-exists="%LOCALAPPDATA%\\HWR-App\\.env" app\\server.mjs',
    "",
  ].join("\r\n"),
);

writeFileSync(
  join(out, "README.txt"),
  [
    "HWR-App: Homeworld Revelations",
    "",
    "Double-click HWR-App.exe. The Kushan badge appears in the system tray, and the host console",
    "opens with the QR code for everyone to join. Right-click the badge to open the TV view, copy",
    "the join link, or quit.",
    "",
    "Saves and settings: %LOCALAPPDATA%\\HWR-App",
    "Claude GM: paste your API key into the Claude GM panel on the host console.",
    "",
    noPrivate
      ? [
          "This copy has no private folder: stock art and synthesised sound.",
          "",
          "HWR-App.exe is unsigned, so Windows SmartScreen or antivirus may warn about it. It's a small",
          "tray launcher (tools/package/launcher/Launcher.cs in the source) that starts the bundled Node.js",
          "server in the background. To skip it, double-click \"Start without launcher.cmd\" instead: it",
          "starts the same server in a window you can see and opens the host console in your browser.",
        ].join("\r\n")
      : "PRIVATE BUILD: the private folder holds licensed game assets, soundtracks and family portraits. Don't share this copy.",
    "",
  ].join("\r\n"),
);

console.log(`\nDone: ${out} (${Math.round(size(out) / 1e6)} MB)`);
