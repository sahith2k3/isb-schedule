import { spawn } from "node:child_process";
import process from "node:process";

// Runs the full local dev stack: the Express API server and the recess Vite
// frontend. The frontend calls the API with relative `/api/*` URLs, so Vite
// proxies those to the API server (see artifacts/recess/vite.config.ts).

const API_PORT = process.env.API_PORT || "5000";
const WEB_PORT = process.env.WEB_PORT || "3000";

/** @type {{ name: string, color: string, filter: string, script: string, env: Record<string, string> }[]} */
const services = [
  {
    name: "api",
    color: "\x1b[36m", // cyan
    filter: "@workspace/api-server",
    script: "dev",
    env: { PORT: API_PORT },
  },
  {
    name: "web",
    color: "\x1b[35m", // magenta
    filter: "@workspace/recess",
    script: "dev",
    env: {
      PORT: WEB_PORT,
      BASE_PATH: "/",
      API_PROXY_TARGET: `http://localhost:${API_PORT}`,
    },
  },
];

const RESET = "\x1b[0m";
const children = [];
let shuttingDown = false;

function prefixStream(stream, name, color) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      process.stdout.write(`${color}[${name}]${RESET} ${line}\n`);
    }
  });
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(code ?? 0);
}

for (const service of services) {
  const child = spawn(
    "pnpm",
    ["--filter", service.filter, "run", service.script],
    {
      cwd: process.cwd(),
      env: { ...process.env, ...service.env },
      stdio: ["inherit", "pipe", "pipe"],
    },
  );

  prefixStream(child.stdout, service.name, service.color);
  prefixStream(child.stderr, service.name, service.color);

  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      process.stdout.write(
        `${service.color}[${service.name}]${RESET} exited (code=${code}, signal=${signal})\n`,
      );
      shutdown(code ?? 1);
    }
  });

  children.push(child);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
