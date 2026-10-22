/** Rebuild local translation checksums without a translation service or credentials. */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import objectHash from "object-hash";

for (const relative of ["../../../apps/web/", "../../surveys/"]) {
  const directory = new URL(relative, import.meta.url);
  const source = JSON.parse(await readFile(new URL("locales/en-US.json", directory), "utf8")) as Record<
    string,
    unknown
  >;
  const entries: Record<string, string> = {};
  const flatten = (node: Record<string, unknown>, prefix = "") => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}/${key}` : key;
      if (typeof value === "string") entries[path] = objectHash.MD5(value);
      else if (value && typeof value === "object" && !Array.isArray(value)) {
        flatten(value as Record<string, unknown>, path);
      }
    }
  };
  flatten(source);
  const content = `version: 1\nchecksums:\n  ${objectHash.MD5({ sourceLocale: "en-US" })}:\n${Object.keys(
    entries
  )
    .sort()
    .map((key) => `    ${key}: ${entries[key]}\n`)
    .join("")}`;
  const destination = new URL("i18n.lock", directory);
  if (process.argv.includes("--check")) {
    if ((await readFile(destination, "utf8")) !== content) throw new Error("Translation lock is stale");
  } else {
    await writeFile(destination, content);
  }
  console.log(`${fileURLToPath(destination)}: ${Object.keys(entries).length} current keys`);
}
