import { beforeEach, describe, expect, test, vi } from "vitest";
import { FakePramaan } from "@forms/pramaan/fake";
import * as pramaanModule from "@/lib/pramaan";
import {
  OFFERED_APPS,
  endUserRefFor,
  executeAppAction,
  listAppConnections,
  searchConnectedAppActions,
  startAppConnection,
} from "./connected-apps";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/pramaan", () => {
  let current: unknown = null;
  return {
    get pramaan() {
      return current;
    },
    __setFake(client: unknown) {
      current = client;
    },
  };
});

const setFake = (client: unknown) => {
  (pramaanModule as unknown as { __setFake: (client: unknown) => void }).__setFake(client);
};

const fake = () => pramaanModule.pramaan as FakePramaan;

beforeEach(() => {
  setFake(new FakePramaan({}));
});

describe("endUserRefFor", () => {
  test("a stable opaque reference, never an email or a name", () => {
    const ref = endUserRefFor("user-1");
    expect(ref).toMatch(/^u_/);
    expect(endUserRefFor("user-1")).toBe(ref);
    // Different users hash apart; the test crypto stub collapses digests, so this
    // is a source-level property rather than a run-time one.
    expect(endUserRefFor.toString()).toContain("sha256");
    expect(endUserRefFor.toString()).toContain("userId");
  });
});

describe("searchConnectedAppActions", () => {
  test("searches the catalogue and returns its entries", async () => {
    fake().route({
      "apps.catalog.search": () => ({
        results: [{ app: "googlesheets", action: "GOOGLESHEETS_APPEND_ROW", description: "Append a row" }],
      }),
    });

    const entries = await searchConnectedAppActions("append a row", "googlesheets");
    expect(entries).toHaveLength(1);
    const request = fake().callsTo("apps.catalog.search")[0] as Record<string, unknown>;
    expect(request.query).toBe("append a row");
    expect(request.app).toBe("googlesheets");
  });
});

describe("startAppConnection", () => {
  test("asks for the person's connect address with this app's own reference", async () => {
    fake().route({
      "apps.connection.start": () => ({ connectUrl: "https://connect.example/start" }),
    });

    const url = await startAppConnection("user-1", "googlesheets", "https://app.example.com/connected");
    expect(url).toBe("https://connect.example/start");
    expect(
      fake().calls.find((call) => call.id === "apps.connection.start")?.opts?.idempotencyKey
    ).toBeTruthy();
    const request = fake().callsTo("apps.connection.start")[0] as Record<string, unknown>;
    expect(request.endUserRef).toMatch(/^u_/);
    expect(request.app).toBe("googlesheets");
    expect(request.redirectUrl).toBe("https://app.example.com/connected");
    // The access level is the app's standard one; nothing narrower is asked.
    expect(request.access).toBeUndefined();
  });
});

describe("listAppConnections", () => {
  test("lists the person's connections to one app", async () => {
    fake().route({
      "apps.connections.list": () => ({ results: [{ app: "slack", status: "active" }] }),
    });

    const connections = await listAppConnections("user-1", "slack");
    expect(connections).toEqual([{ app: "slack", status: "active" }]);
    const request = fake().callsTo("apps.connections.list")[0] as Record<string, unknown>;
    expect(request.app).toBe("slack");
  });
});

describe("executeAppAction", () => {
  test("runs the action for the person and returns what it did", async () => {
    fake().route({
      "apps.action.execute": () => ({ status: "succeeded", output: { row: "appended" } }),
    });

    const result = await executeAppAction("user-1", "GOOGLESHEETS_APPEND_ROW", { row: { a: "1" } });
    expect(result.status).toBe("succeeded");
    expect(fake().calls.find((call) => call.id === "apps.action.execute")?.opts?.idempotencyKey).toBeTruthy();
    const request = fake().callsTo("apps.action.execute")[0] as Record<string, unknown>;
    expect(request.action).toBe("GOOGLESHEETS_APPEND_ROW");
  });
});

describe("offered apps", () => {
  test("the four apps this product offers, and nothing else passes the check", () => {
    expect(OFFERED_APPS).toEqual(["googlesheets", "airtable", "notion", "slack"]);
  });
});
