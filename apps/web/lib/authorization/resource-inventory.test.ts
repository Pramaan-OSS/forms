import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { PRISMA_AUTHORIZATION_RESOURCE_INVENTORY } from "./resource-inventory";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

const readPrismaModels = (): ReadonlyArray<string> => {
  const schemaDirectory = join(REPOSITORY_ROOT, "packages/database/schema");
  const models = readdirSync(schemaDirectory)
    .filter((file) => file.endsWith(".prisma"))
    .flatMap((file) =>
      [...readFileSync(join(schemaDirectory, file), "utf8").matchAll(/^model\s+(\w+)\s+\{/gm)].map(
        ([, model]) => model
      )
    );

  return [...new Set(models)].sort();
};

describe("authorization resource inventory", () => {
  test("classifies every Prisma model exactly once", () => {
    expect(Object.keys(PRISMA_AUTHORIZATION_RESOURCE_INVENTORY).sort()).toEqual(readPrismaModels());
  });

  test("keeps every current grant source in the relationship category", () => {
    for (const source of [
      "Membership",
      "TeamUser",
      "WorkspaceTeam",
      "ApiKey",
      "ApiKeyWorkspace",
      "FeedbackDirectoryWorkspace",
    ] as const) {
      expect(PRISMA_AUTHORIZATION_RESOURCE_INVENTORY[source]).toBe("relationship_or_grant_source");
    }
  });

  test("keeps charts and workflows workspace-inherited rather than standalone Phase 1 ACLs", () => {
    expect(PRISMA_AUTHORIZATION_RESOURCE_INVENTORY.Chart).toBe("workspace_inherited_resource");
    expect(PRISMA_AUTHORIZATION_RESOURCE_INVENTORY.Workflow).toBe("workspace_inherited_resource");
  });
});
