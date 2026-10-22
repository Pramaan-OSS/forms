import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";

export function prepareStart(file = ".env") {
  let source = existsSync(file) ? readFileSync(file, "utf8") : "PRAMAAN_API_KEY=\n";
  const values = parseEnv(source);
  const set = (name, value, overwrite = false) => {
    if (values[name]?.trim() && !overwrite) return;
    source = source
      .split("\n")
      .filter((line) => line.split("=")[0].trim() !== name)
      .join("\n");
    source += `\n${name}=${value}\n`;
    values[name] = value;
  };
  for (const name of [
    "ENCRYPTION_KEY",
    "BETTER_AUTH_SECRET",
    "CRON_SECRET",
    "AUTHZED_TOKEN",
    "AUTHZED_DATABASE_PASSWORD",
    "POSTGRES_PASSWORD",
  ])
    set(
      name,
      name === "BETTER_AUTH_SECRET" && values.NEXTAUTH_SECRET
        ? values.NEXTAUTH_SECRET
        : randomBytes(32).toString("hex")
    );
  const defaults = {
    WEBAPP_URL: values.APP_URL || "http://localhost:3036",
    BETTER_AUTH_URL: values.APP_URL || values.WEBAPP_URL || "http://localhost:3036",
    APP_PORT: "3036",
    POSTGRES_PORT: "55436",
    REDIS_PORT: "56336",
    PERMISSIONS_PORT: "55056",
    DATABASE_URL: `postgresql://postgres:${encodeURIComponent(values.POSTGRES_PASSWORD)}@localhost:${values.POSTGRES_PORT || "55436"}/forms`,
    REDIS_URL: `redis://localhost:${values.REDIS_PORT || "56336"}`,
    AUTHZED_ENABLED: "true",
    AUTHZED_ENDPOINT: `localhost:${values.PERMISSIONS_PORT || "55056"}`,
    AUTHZED_SYSTEM_KEY: "forms",
    AUTHZED_INSECURE: "true",
    AUTHZED_CONSISTENCY: "fully_consistent",
    FORMS_STORAGE_DRIVER: "local",
    FORMS_UPLOAD_DIR: "/app/.data/uploads",
    OTEL_ENABLED: "0",
    LOG_LEVEL: "info",
  };
  for (const [name, value] of Object.entries(defaults)) set(name, value);
  if (values.APP_URL?.trim()) {
    set("WEBAPP_URL", values.APP_URL, true);
    set("BETTER_AUTH_URL", values.APP_URL, true);
  }
  writeFileSync(file, source, { mode: 0o600 });
  chmodSync(file, 0o600);
  console.log(
    values.PRAMAAN_API_KEY?.trim()
      ? `Open ${values.WEBAPP_URL} after startup finishes.`
      : "Add PRAMAAN_API_KEY to .env"
  );
}
if (import.meta.url === new URL(process.argv[1], "file:").href) prepareStart(process.argv[2]);
