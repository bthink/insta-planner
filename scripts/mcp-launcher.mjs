import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

// Clients can launch this absolute path from any working directory.
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
process.chdir(root);
const envFile = path.join(root, ".env.local");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
await tsImport("./mcp.ts", import.meta.url);
