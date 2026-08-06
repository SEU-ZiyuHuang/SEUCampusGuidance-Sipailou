import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(webDir, "..");

async function copySharedDirectory(name) {
  const source = path.join(projectDir, name);
  const destination = path.join(webDir, name);
  await fs.rm(destination, { recursive: true, force: true });
  await fs.cp(source, destination, { recursive: true, force: true });
  const entries = await fs.readdir(destination);
  console.log(`[vercel-build] copied ${name}/ (${entries.length} top-level entries)`);
}

await copySharedDirectory("data");
await copySharedDirectory("原校区指南");

// This file is useful for opening index.html directly on a local machine, but
// production must use the environment-backed /api/runtime-config rewrite.
if (process.env.VERCEL) {
  await fs.rm(path.join(webDir, "runtime-config.js"), { force: true });
  console.log("[vercel-build] removed local runtime-config.js in favor of the API route");
}
