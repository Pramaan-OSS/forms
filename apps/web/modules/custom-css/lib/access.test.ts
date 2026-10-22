import { beforeEach, describe, expect, test, vi } from "vitest";
import { can } from "@/lib/authorization";
import { canWriteWorkspaceCustomCss, getCustomCssPlanAllowed } from "./access";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/authorization", () => ({ can: vi.fn() }));

const workspace = { workspaceId: "ws_1", organizationId: "org_1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCustomCssPlanAllowed", () => {
  test("custom CSS is part of the plan-free product, so it is always allowed", async () => {
    await expect(getCustomCssPlanAllowed()).resolves.toBe(true);
  });
});

describe("canWriteWorkspaceCustomCss", () => {
  test("a user needs organization manage — owners and managers, not a team's workspace manage", async () => {
    vi.mocked(can).mockResolvedValue(true);

    await expect(canWriteWorkspaceCustomCss({ type: "user", id: "user_1" }, workspace)).resolves.toBe(true);
    expect(can).toHaveBeenCalledWith({ type: "user", id: "user_1" }, "organization.manage", {
      type: "organization",
      id: "org_1",
    });
  });

  test("members and billing users are refused", async () => {
    vi.mocked(can).mockResolvedValue(false);
    await expect(canWriteWorkspaceCustomCss({ type: "user", id: "member" }, workspace)).resolves.toBe(false);
  });

  test("an API key needs manage on that workspace; a read or read-write grant is not enough", async () => {
    vi.mocked(can).mockImplementation(async (_actor, action) => action === "workspace.manage");

    await expect(canWriteWorkspaceCustomCss({ type: "apiKey", id: "key_manage" }, workspace)).resolves.toBe(
      true
    );
    expect(can).toHaveBeenCalledWith({ type: "apiKey", id: "key_manage" }, "workspace.manage", {
      type: "workspace",
      id: "ws_1",
    });

    vi.mocked(can).mockResolvedValue(false);
    await expect(canWriteWorkspaceCustomCss({ type: "apiKey", id: "key_write" }, workspace)).resolves.toBe(
      false
    );
  });

  test("no principal is no write", async () => {
    await expect(canWriteWorkspaceCustomCss(null, workspace)).resolves.toBe(false);
    expect(can).not.toHaveBeenCalled();
  });
});
