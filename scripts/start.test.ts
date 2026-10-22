import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { afterEach, expect, test, vi } from "vitest";
import { prepareStart } from "./prepare-start.mjs";

const scratch = path.resolve(".scratch", `startup-${randomUUID()}`);
mkdirSync(scratch, { recursive: true });
afterEach(() => vi.restoreAllMocks());
test("generates private secrets once and preserves them across restarts", () => {
  const file = path.join(scratch, ".env");
  writeFileSync(file, "PRAMAAN_API_KEY=dummy\n");
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  prepareStart(file);
  const first = parseEnv(readFileSync(file, "utf8"));
  prepareStart(file);
  expect(parseEnv(readFileSync(file, "utf8"))).toEqual(first);
  expect(first.ENCRYPTION_KEY).toHaveLength(64);
  expect(first.BETTER_AUTH_SECRET).toHaveLength(64);
  expect(first.DATABASE_URL).toContain(":55436/forms");
  expect(output.mock.calls.flat().join(" ")).not.toContain(first.ENCRYPTION_KEY);
});
test("reads environment values as data and explains a missing key", () => {
  const marker = path.join(scratch, "must-not-exist");
  const file = path.join(scratch, "no-key.env");
  writeFileSync(file, `PRAMAAN_API_KEY=\nUNTRUSTED=$(touch ${marker})\n`);
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  prepareStart(file);
  expect(existsSync(marker)).toBe(false);
  expect(output).toHaveBeenCalledWith("Add PRAMAAN_API_KEY to .env");
});
process.on("exit", () => rmSync(scratch, { recursive: true, force: true }));

test("uses isolated service ports for local development connections", () => {
  const file = path.join(scratch, "isolated.env");
  writeFileSync(file, "POSTGRES_PORT=55446\nREDIS_PORT=56346\nPERMISSIONS_PORT=55066\n");
  vi.spyOn(console, "log").mockImplementation(() => {});
  prepareStart(file);
  const values = parseEnv(readFileSync(file, "utf8"));
  expect(values.DATABASE_URL).toContain(":55446/forms");
  expect(values.REDIS_URL).toBe("redis://localhost:56346");
  expect(values.AUTHZED_ENDPOINT).toBe("localhost:55066");
});

test("startup explains its modes and rejects unknown flags before starting services", () => {
  const help = spawnSync("sh", ["start", "--help"], { encoding: "utf8" });
  expect(help.status).toBe(0);
  expect(help.stdout).toContain("--production");
  const invalid = spawnSync("sh", ["start", "--unknown"], { encoding: "utf8" });
  expect(invalid.status).toBe(2);
  expect(invalid.stdout).toContain("Usage:");
});

test("startup serves compiled pages by default and passes an explicit development choice to services", () => {
  const bin = path.join(scratch, "bin");
  mkdirSync(bin, { recursive: true });
  const log = path.join(scratch, "modes");
  writeFileSync(path.join(bin, "docker"), '#!/bin/sh\nprintf "%s\\n" "$FORMS_START_MODE" >> "$FORMS_MODE_LOG"\n', { mode: 0o700 });
  for (const [args, mode] of [[[], "production"], [["--production"], "production"], [["--development"], "development"]] as const) {
    writeFileSync(log, "");
    const result = spawnSync("sh", ["start", ...args], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FORMS_MODE_LOG: log },
    });
    expect(result.status).toBe(0);
    expect(readFileSync(log, "utf8").trim().split("\n")).toEqual([mode, mode]);
  }
});

test("APP_URL changes the public app and session origins together on an existing install", () => {
  const file = path.join(scratch, "public-origin.env");
  writeFileSync(
    file,
    "PRAMAAN_API_KEY=dummy\nWEBAPP_URL=http://localhost:3036\nBETTER_AUTH_URL=http://localhost:3036\nAPP_URL=https://forms.example.test\n"
  );
  vi.spyOn(console, "log").mockImplementation(() => {});
  prepareStart(file);
  const values = parseEnv(readFileSync(file, "utf8"));
  expect(values.WEBAPP_URL).toBe("https://forms.example.test");
  expect(values.BETTER_AUTH_URL).toBe(values.WEBAPP_URL);
});
