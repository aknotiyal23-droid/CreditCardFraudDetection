import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(frontendDir, "..");
const pythonCandidates = [
  path.join(projectRoot, "venv", "Scripts", "python.exe"),
  path.join(projectRoot, ".venv", "Scripts", "python.exe"),
];
const python = pythonCandidates.find(existsSync);

if (!python) {
  console.error("Python virtual environment not found. Create one in the project root first.");
  process.exit(1);
}

let backend;
let backendError;
let backendExit;
let frontend;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const apiHealthUrl = "http://127.0.0.1:8000/health";
async function apiIsReady() {
  try {
    const response = await fetch(apiHealthUrl, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

let backendReady = await apiIsReady();
let ownsBackend = false;
if (backendReady) {
  console.log("Using the backend already running at http://127.0.0.1:8000");
} else {
  console.log("Starting the fraud detection backend and loading its models...");
  backend = spawn(
    python,
    ["-u", "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000"],
    { cwd: projectRoot, stdio: "inherit" },
  );
  ownsBackend = true;
  backend.on("error", (error) => { backendError = error; });
  backend.on("exit", (code, signal) => {
    backendExit = { code, signal };
    if (frontend) {
      console.error("Backend stopped; stopping the frontend too.");
      frontend.kill();
    }
  });

  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (backendError) throw backendError;
    if (backendExit) {
      throw new Error(`Backend exited before startup (code ${backendExit.code ?? backendExit.signal}).`);
    }
    if (await apiIsReady()) {
      backendReady = true;
      break;
    }
    await delay(1000);
  }
}

if (!backendReady) {
  if (ownsBackend) backend.kill();
  throw new Error("Backend did not become ready within 3 minutes. Check the backend messages above.");
}

console.log("Backend is ready. Starting the dashboard at http://127.0.0.1:5173");
frontend = spawn(
  process.execPath,
  [path.join(frontendDir, "node_modules", "vite", "bin", "vite.js"), "--host", "localhost"],
  { cwd: frontendDir, stdio: "inherit" },
);

frontend.on("error", (error) => {
  console.error("Could not start Vite:", error.message);
  frontend = null;
  if (ownsBackend) backend.kill();
  process.exitCode = 1;
});

frontend.on("exit", (code) => {
  frontend = null;
  if (ownsBackend) backend.kill();
  process.exitCode = code ?? 0;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    frontend?.kill();
    if (ownsBackend) backend.kill();
    process.exit(0);
  });
}
