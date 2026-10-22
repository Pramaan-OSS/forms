import { readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../apps/web/.next/standalone", import.meta.url));
// The framework copies loaded environment files separately from its file tracing.
// Runtime configuration comes from the operator's environment, never the build archive.
function clean(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.name === ".env" || entry.name.startsWith(".env.")) rmSync(file, { force: true });
    else if (entry.isDirectory()) clean(file);
  }
}
clean(root);
