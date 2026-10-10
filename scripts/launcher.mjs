import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const runtime = path.join(root, ".runtime"),
  pidFile = path.join(runtime, "server.json"),
  lockFile = path.join(runtime, "launcher.lock");
const address = "http://127.0.0.1:3210";
fs.mkdirSync(runtime, { recursive: true });
async function health() {
  try {
    const response = await fetch(`${address}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.app === "InstaPlanner" && data.ready ? data : null;
  } catch {
    return null;
  }
}
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function readPid() {
  try {
    return JSON.parse(fs.readFileSync(pidFile, "utf8"));
  } catch {
    return null;
  }
}
function browser() {
  if (!process.env.INSTAPLANNER_NO_OPEN)
    execFileSync("/usr/bin/open", [address]);
}
function lock() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(lockFile, "wx");
      fs.writeFileSync(fd, String(process.pid));
      fs.closeSync(fd);
      return;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const pid = Number(fs.readFileSync(lockFile, "utf8"));
      if (pid && alive(pid))
        throw new Error(
          "Uruchamianie lub zatrzymywanie już trwa. Spróbuj za chwilę.",
        );
      fs.rmSync(lockFile, { force: true });
    }
  }
}
async function start() {
  if (await health()) {
    browser();
    console.log(`InstaPlanner działa: ${address}`);
    return;
  }
  if (!fs.existsSync(path.join(root, "node_modules/next/dist/bin/next")))
    throw new Error(
      "Brak zależności. Jednorazowo wykonaj npm ci w folderze projektu.",
    );
  if (!fs.existsSync(path.join(root, ".next/BUILD_ID"))) {
    console.log("Przygotowuję aplikację do pierwszego uruchomienia...");
    execFileSync(
      process.execPath,
      ["node_modules/next/dist/bin/next", "build", "--webpack"],
      { cwd: root, stdio: "inherit" },
    );
  }
  const existing = readPid();
  if (existing?.pid && alive(existing.pid))
    throw new Error(
      "Istniejąca instancja nie odpowiada. Sprawdź .runtime/server.log lub użyj Zatrzymaj InstaPlanner.command.",
    );
  const instanceId = randomUUID(),
    log = fs.openSync(path.join(runtime, "server.log"), "a", 0o600);
  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3210",
    ],
    {
      cwd: root,
      detached: true,
      stdio: ["ignore", log, log],
      env: { ...process.env, INSTAPLANNER_INSTANCE_ID: instanceId },
    },
  );
  fs.closeSync(log);
  fs.writeFileSync(pidFile, JSON.stringify({ pid: child.pid, instanceId }));
  child.unref();
  for (let attempt = 0; attempt < 40; attempt++) {
    const status = await health();
    if (status?.instanceId === instanceId) {
      browser();
      console.log(`InstaPlanner gotowy: ${address}`);
      return;
    }
    if (!alive(child.pid)) break;
    await delay(500);
  }
  if (alive(child.pid)) process.kill(child.pid, "SIGTERM");
  throw new Error(
    "Serwer nie osiągnął gotowości. Port 3210 może być zajęty albo folder danych niedostępny. Szczegóły: .runtime/server.log",
  );
}
async function stop() {
  const record = readPid();
  if (!record?.pid || !alive(record.pid)) {
    fs.rmSync(pidFile, { force: true });
    console.log("InstaPlanner jest zatrzymany.");
    return;
  }
  const status = await health();
  if (!status || status.instanceId !== record.instanceId)
    throw new Error(
      "Nie potwierdzono tożsamości procesu. Nie zatrzymano innej aplikacji. Sprawdź .runtime/server.log.",
    );
  process.kill(record.pid, "SIGTERM");
  for (let i = 0; i < 30 && alive(record.pid); i++) await delay(200);
  if (alive(record.pid))
    throw new Error("Serwer nadal kończy pracę. Spróbuj ponownie za chwilę.");
  fs.rmSync(pidFile, { force: true });
  console.log("InstaPlanner zatrzymany.");
}
try {
  lock();
  try {
    if (process.argv[2] === "stop") await stop();
    else await start();
  } finally {
    fs.rmSync(lockFile, { force: true });
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
