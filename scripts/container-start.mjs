import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const production = process.env.FORMS_START_MODE !== "development";
if (process.env.FORMS_START_MODE && !["production", "development"].includes(process.env.FORMS_START_MODE))
  throw new Error("Choose development or production startup mode.");
if (!process.env.PRAMAAN_API_KEY?.trim()) console.log("Managed services are disabled; using local sign-in.");
mkdirSync(".scratch", { recursive: true });
process.env.TMPDIR = "/app/.scratch";
process.env.pnpm_config_verify_deps_before_run = "false";
process.env.COREPACK_ENABLE_DOWNLOAD_PROMPT = "0";
process.env.TSX_TSCONFIG_PATH = "/app/apps/web/tsconfig.json";
process.env.NEXT_TELEMETRY_DISABLED = "1";
process.env.TURBO_TELEMETRY_DISABLED = "1";
process.env.FORMS_LOCAL_START = "1";
if (process.env.PRAMAAN_FAKE === "1") process.env.EMAIL_VERIFICATION_DISABLED = "1";
const run = (command, args, extra = {}) => {
  const result = spawnSync(command, args, { stdio: "inherit", env: { ...process.env, ...extra } });
  if (result.status !== 0) process.exit(result.status || 1);
};
run("corepack", ["enable"]);
run("corepack", ["pnpm", "install", "--frozen-lockfile", "--ignore-scripts"]);
// Dependencies are installed before loading the shared TypeScript client.
const { register } = await import("tsx/esm/api");
register();
const { pramaanFromEnv } = await import("../packages/pramaan/src/index.ts");
const {
  ManagedStartupError,
  privateRuntimeStore,
  resolveManagedDatabase,
  resolveManagedSignIn,
  runtimeKeyRef,
} = await import("../packages/pramaan/src/managed-runtime.ts");
const client = pramaanFromEnv();
const actionStore = privateRuntimeStore(".runtime/actions.json");
const database = await resolveManagedDatabase({
  client,
  actionStore,
  keyRef: client ? runtimeKeyRef(process.env.PRAMAAN_API_KEY) : undefined,
  store: privateRuntimeStore(".runtime/database.json"),
  localConnectionString: process.env.FORMS_LOCAL_DATABASE_URL || process.env.DATABASE_URL,
  log: (line) => console.log(line),
}).catch((error) => {
  console.error(
    error instanceof ManagedStartupError
      ? error.message
      : "Managed database setup could not be confirmed. Keep the private startup settings."
  );
  process.exit(1);
});
process.env.DATABASE_URL = database.connectionString;
const backend = client
  ? await resolveManagedSignIn({
      client,
      actionStore,
      keyRef: runtimeKeyRef(process.env.PRAMAAN_API_KEY),
      store: privateRuntimeStore(".runtime/sign-in.json"),
      appUrl: process.env.APP_URL || process.env.WEBAPP_URL,
      log: (line) => console.log(line),
    }).catch((error) => {
      console.error(
        error instanceof ManagedStartupError ? error.message : "Managed sign-in setup could not be confirmed."
      );
      process.exit(1);
    })
  : null;
process.env.FORMS_MANAGED_AUTH_URL = backend?.authUrl || "";
process.env.FORMS_MANAGED_JWKS_URL = backend?.jwksUrl || "";

run("corepack", ["pnpm", "exec", "turbo", "run", "build", "--filter=@forms/web^...", "--env-mode=loose"]);
run("node", ["packages/database/dist/scripts/apply-migrations.js"], {
  NODE_ENV: "production",
  DATABASE_URL: database.directConnectionString,
});
run("node", [
  "--conditions=react-server",
  "--import",
  "tsx",
  "apps/web/scripts/authzed-upgrade.ts",
  "prepare",
]);
run("node", ["--conditions=react-server", "--import", "tsx", "apps/web/scripts/authzed-upgrade.ts", "check"]);
if (production)
  run("corepack", ["pnpm", "--filter", "@forms/web", "exec", "next", "build"], {
    NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=8192",
  });
const server = spawn(
  "corepack",
  [
    "pnpm",
    "--filter",
    "@forms/web",
    "exec",
    "next",
    production ? "start" : "dev",
    "--hostname",
    "0.0.0.0",
    "--port",
    "3000",
  ],
  { stdio: "inherit", env: process.env }
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code ?? 1));
