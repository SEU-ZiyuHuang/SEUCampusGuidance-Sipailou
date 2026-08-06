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
