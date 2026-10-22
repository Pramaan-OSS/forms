import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";
import { FakePramaan } from "./fake";
import { PramaanError } from "./index";
import { type RuntimeStore, privateRuntimeStore, resolveManagedDatabase } from "./managed-runtime";

const connectionString = "postgresql://test:private@database.example.test/forms";
const directConnectionString = "postgresql://test:private@direct.example.test/forms";
const provisioned = { created: true, connectionString, directConnectionString };
const memory = () => {
  let value: Record<string, unknown> | undefined;
  return {
    read: async () => value,
    write: async (next) => {
      value = next;
    },
  } satisfies RuntimeStore;
};
const options = (client: FakePramaan, store = memory()) => ({
  client,
  store,
  actionStore: memory(),
  keyRef: "test-project",
  localConnectionString: "postgresql://local/forms",
  log: vi.fn(),
});
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe("managed database startup", () => {
  test("without a key, local startup makes no provisioning call", async () => {
    const input = options(new FakePramaan({}));
    expect(await resolveManagedDatabase({ ...input, client: null, keyRef: undefined })).toEqual({
      connectionString: input.localConnectionString,
      directConnectionString: input.localConnectionString,
      managed: false,
    });
    expect(input.client.calls).toHaveLength(0);
  });
  test("removing the key retains saved database credentials without provisioning", async () => {
    const input = options(new FakePramaan({ "db.postgres.provision": () => provisioned }));
    await resolveManagedDatabase(input);
    expect(await resolveManagedDatabase({ ...input, client: null, keyRef: undefined })).toMatchObject({
      managed: true,
      connectionString,
    });
    expect(input.client.calls).toHaveLength(1);
  });

  test("provisions once, saves the one-time credentials and reuses them without a call", async () => {
    const client = new FakePramaan({ "db.postgres.provision": () => provisioned });
    const input = options(client);
    expect(await resolveManagedDatabase(input)).toEqual({
      connectionString,
      directConnectionString,
      managed: true,
    });
    expect(await resolveManagedDatabase(input)).toEqual({
      connectionString,
      directConnectionString,
      managed: true,
    });
    expect(client.callsTo("db.postgres.provision")).toHaveLength(1);
    expect(client.calls[0].opts?.idempotencyKey).toBeTruthy();
    expect(input.log).not.toHaveBeenCalled();
  });
  test("falls back only on upstream_unavailable, with one plain line and no credentials", async () => {
    const client = new FakePramaan({
      "db.postgres.provision": () => {
        throw new PramaanError("upstream_unavailable", connectionString);
      },
    });
    const input = options(client);
    expect(await resolveManagedDatabase(input)).toEqual({
      connectionString: input.localConnectionString,
      directConnectionString: input.localConnectionString,
      managed: false,
    });
    expect(input.log).toHaveBeenCalledExactlyOnceWith(
      "Managed database is unavailable; using the bundled local database."
    );
    expect(await input.store.read()).toBeUndefined();
  });
  test.each(["unauthorized", "rate_limited", "conflict"] as const)(
    "refuses %s without exposing the upstream error",
    async (code) => {
      const client = new FakePramaan({
        "db.postgres.provision": () => {
          throw new PramaanError(code, connectionString);
        },
      });
      await expect(resolveManagedDatabase(options(client))).rejects.toThrow(
        "Managed database setup could not be confirmed."
      );
    }
  );
  test("does not replace a saved database after the key changes", async () => {
    const input = options(new FakePramaan({ "db.postgres.provision": () => provisioned }));
    await resolveManagedDatabase(input);
    await expect(resolveManagedDatabase({ ...input, keyRef: "another-project" })).rejects.toThrow(
      "do not match"
    );
    expect(input.client.calls).toHaveLength(1);
  });
  test("refuses an existing database whose once-only credentials were not saved", async () => {
    const input = options(
      new FakePramaan({ "db.postgres.provision": () => ({ created: false, status: "ready" }) })
    );
    await expect(resolveManagedDatabase(input)).rejects.toThrow("Restore the saved settings");
    expect(await input.store.read()).toBeUndefined();
  });
  test("refuses to start if credential storage fails", async () => {
    const input = options(new FakePramaan({ "db.postgres.provision": () => provisioned }));
    input.store.write = async () => {
      throw new Error("disk full");
    };
    await expect(resolveManagedDatabase(input)).rejects.toThrow("disk full");
  });
  test("writes private credentials atomically with file mode 0600 and directory mode 0700", async () => {
    const directory = fileURLToPath(
      new URL(`../../../.scratch/managed-runtime-${randomUUID()}/`, import.meta.url)
    );
    directories.push(directory);
    await mkdir(directory, { recursive: true });
    const store = privateRuntimeStore(`${directory}/database.json`);
    await store.write({ connectionString });
    expect((await stat(`${directory}/database.json`)).mode & 0o777).toBe(0o600);
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    expect(await store.read()).toEqual({ connectionString });
    expect(await readFile(`${directory}/database.json`, "utf8")).toContain(connectionString);
  });
});

const backend = {
  status: "ready",
  authUrl: "https://signin.example.test/auth",
  jwksUrl: "https://signin.example.test/auth/keys",
};

describe("managed sign-in startup", () => {
  test("provisions once, sets the public return origin and reuses the backend", async () => {
    const { resolveManagedSignIn } = await import("./managed-runtime");
    const client = new FakePramaan({
      "auth.backend.provision": () => backend,
      "auth.backend.domains.set": () => ({ allowedDomains: [{ domain: "https://forms.example.test" }] }),
    });
    const input = {
      client,
      store: memory(),
      actionStore: memory(),
      keyRef: "project",
      appUrl: "https://forms.example.test/path",
      log: vi.fn(),
    };
    expect(await resolveManagedSignIn(input)).toEqual({ authUrl: backend.authUrl, jwksUrl: backend.jwksUrl });
    await resolveManagedSignIn(input);
    expect(client.callsTo("auth.backend.provision")).toHaveLength(1);
    expect(client.callsTo("auth.backend.domains.set")[0]).toMatchObject({
      domains: ["https://forms.example.test"],
    });
    expect(client.callsTo("auth.backend.domains.set")).toHaveLength(1);
  });
  test.each(["http://localhost:3036", "http://127.0.0.1:3036", "https://localhost:3036"])(
    "skips domain configuration for %s",
    async (appUrl) => {
      const { resolveManagedSignIn } = await import("./managed-runtime");
      const client = new FakePramaan({ "auth.backend.provision": () => backend });
      const log = vi.fn();
      expect(
        await resolveManagedSignIn({
          client,
          store: memory(),
          actionStore: memory(),
          keyRef: "project",
          appUrl,
          log,
        })
      ).not.toBeNull();
      expect(client.callsTo("auth.backend.domains.set")).toHaveLength(0);
      expect(log).toHaveBeenCalledExactlyOnceWith(
        "Managed sign-in return domains were not set for this local address."
      );
    }
  );
  test("retains local sign-in when provisioning is unavailable", async () => {
    const { resolveManagedSignIn } = await import("./managed-runtime");
    const client = new FakePramaan({
      "auth.backend.provision": () => {
        throw new PramaanError("upstream_unavailable", "private detail");
      },
    });
    const input = {
      client,
      store: memory(),
      actionStore: memory(),
      keyRef: "project",
      appUrl: "http://localhost:3036",
      log: vi.fn(),
    };
    expect(await resolveManagedSignIn(input)).toBeNull();
    expect(input.log).toHaveBeenCalledExactlyOnceWith("Managed sign-in is unavailable; using local sign-in.");
    expect(await input.store.read()).toBeUndefined();
  });
  test("keeps the provisioned backend if setting domains fails and retries that step", async () => {
    const { resolveManagedSignIn } = await import("./managed-runtime");
    const client = new FakePramaan({
      "auth.backend.provision": () => backend,
      "auth.backend.domains.set": () => {
        throw Error("failed");
      },
    });
    const input = {
      client,
      store: memory(),
      actionStore: memory(),
      keyRef: "project",
      appUrl: "https://forms.example.test",
      log: vi.fn(),
    };
    await expect(resolveManagedSignIn(input)).rejects.toThrow("return address");
    client.route({ "auth.backend.domains.set": () => ({ allowedDomains: [{ domain: input.appUrl }] }) });
    expect(await resolveManagedSignIn(input)).toMatchObject({ authUrl: backend.authUrl });
    expect(client.callsTo("auth.backend.provision")).toHaveLength(1);
  });
});

describe("managed token verification", () => {
  const signedToken = (claims: unknown) =>
    `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.test-signature`;
  const verified = {
    valid: true,
    userId: "user_test",
    sessionId: "session_test",
    orgId: null,
    expiresAt: "2099-01-01T00:00:00Z",
  };
  test("reads signed email only after verification and binds it to the verified subject", async () => {
    const { verifyManagedToken } = await import("./managed-runtime");
    const client = new FakePramaan({ "auth.token.verify": () => verified });
    const token = signedToken({
      sub: "user_test",
      email: "person@example.test",
      email_verified: true,
      name: "Person",
    });
    expect(await verifyManagedToken(client, backend, token, "http://localhost:3036")).toMatchObject({
      providerKey: "managed",
      subjectId: "managed:https://signin.example.test:user_test",
      email: "person@example.test",
      emailVerified: true,
      displayName: "Person",
    });
    expect(client.calls).toHaveLength(1);
    expect(client.callsTo("auth.token.verify")[0]).toEqual({
      token,
      audience: "https://signin.example.test",
      authorizedParties: ["http://localhost:3036"],
    });
  });
  test.each(["tampered-token", "expired-token", "wrong-audience"])(
    "refuses %s before reading claims",
    async (token) => {
      const { verifyManagedToken } = await import("./managed-runtime");
      const client = new FakePramaan({ "auth.token.verify": () => ({ valid: false }) });
      await expect(verifyManagedToken(client, backend, token, "http://localhost:3036")).rejects.toThrow(
        "could not be verified"
      );
      expect(client.calls).toHaveLength(1);
    }
  );
  test.each([
    { sub: "other-user", email: "person@example.test" },
    { sub: "user_test" },
    { sub: "user_test", email: "invalid" },
    null,
  ])("refuses mismatched or incomplete signed claims", async (claims) => {
    const { verifyManagedToken } = await import("./managed-runtime");
    const client = new FakePramaan({ "auth.token.verify": () => verified });
    await expect(
      verifyManagedToken(client, backend, signedToken(claims), "http://localhost:3036")
    ).rejects.toThrow("could not be verified");
  });
  test("refuses malformed JWT payloads even after a positive verification fixture", async () => {
    const { verifyManagedToken } = await import("./managed-runtime");
    const client = new FakePramaan({ "auth.token.verify": () => verified });
    await expect(
      verifyManagedToken(client, backend, "e30.invalid.signature", "http://localhost:3036")
    ).rejects.toThrow("could not be verified");
  });
});

describe("persisted startup action identifiers", () => {
  test("database retries reuse the identifier saved before the first request", async () => {
    const client = new FakePramaan({
      "db.postgres.provision": () => {
        throw new PramaanError("upstream_unavailable", "private");
      },
    });
    const input = options(client);
    await resolveManagedDatabase(input);
    await resolveManagedDatabase(input);
    expect(client.calls).toHaveLength(2);
    expect(client.calls[0].opts?.idempotencyKey).toMatch(/^managed-database-/);
    expect(client.calls[1].opts?.idempotencyKey).toBe(client.calls[0].opts?.idempotencyKey);
  });
  test("sign-in retries across new store instances retain the private saved identifier", async () => {
    const { resolveManagedSignIn } = await import("./managed-runtime");
    const directory = fileURLToPath(
      new URL(`../../../.scratch/startup-actions-${randomUUID()}/`, import.meta.url)
    );
    directories.push(directory);
    const client = new FakePramaan({
      "auth.backend.provision": () => {
        throw new PramaanError("upstream_unavailable", "private");
      },
    });
    const input = {
      client,
      store: memory(),
      keyRef: "project",
      appUrl: "http://localhost:3036",
      log: vi.fn(),
    };
    await resolveManagedSignIn({ ...input, actionStore: privateRuntimeStore(`${directory}/actions.json`) });
    client.route({ "auth.backend.provision": () => backend });
    await resolveManagedSignIn({ ...input, actionStore: privateRuntimeStore(`${directory}/actions.json`) });
    expect(client.calls[1].opts?.idempotencyKey).toBe(client.calls[0].opts?.idempotencyKey);
    expect(client.calls[0].opts?.idempotencyKey).toMatch(/^managed-signin-/);
    expect((await stat(`${directory}/actions.json`)).mode & 0o777).toBe(0o600);
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
  });
  test("domain retries reuse the action, but later configuration changes get a new one", async () => {
    const { resolveManagedSignIn } = await import("./managed-runtime");
    const client = new FakePramaan({
      "auth.backend.provision": () => backend,
      "auth.backend.domains.set": () => {
        throw new PramaanError("upstream_timeout", "private");
      },
    });
    const input = {
      client,
      store: memory(),
      actionStore: memory(),
      keyRef: "project",
      appUrl: "https://forms.example.test",
      log: vi.fn(),
    };
    await expect(resolveManagedSignIn(input)).rejects.toThrow("did not answer in time");
    client.route({ "auth.backend.domains.set": () => ({ allowedDomains: [] }) });
    await resolveManagedSignIn(input);
    await resolveManagedSignIn({ ...input, appUrl: "https://other.example.test" });
    await resolveManagedSignIn(input);
    const calls = client.calls.filter((call) => call.id === "auth.backend.domains.set");
    expect(calls).toHaveLength(4);
    expect(calls[0].opts?.idempotencyKey).toBe(calls[1].opts?.idempotencyKey);
    expect(new Set(calls.map((call) => call.opts?.idempotencyKey)).size).toBe(3);
    expect(client.callsTo("auth.backend.provision")).toHaveLength(1);
  });
  test("an identifier must be saved successfully before provisioning can act", async () => {
    const input = options(new FakePramaan({ "db.postgres.provision": () => provisioned }));
    input.actionStore.write = async () => {
      throw new Error("private store unavailable");
    };
    await expect(resolveManagedDatabase(input)).rejects.toThrow("store unavailable");
    expect(input.client.calls).toHaveLength(0);
  });
  test.each(["auth.backend.provision", "db.postgres.provision"] as const)(
    "preserves the safe missing-header reason for %s startup logs",
    async (id) => {
      const { ManagedStartupError, resolveManagedSignIn } = await import("./managed-runtime");
      const { MISSING_ACTION_KEY } = await import("./action-policy");
      const client = new FakePramaan({
        [id]: () => {
          throw new PramaanError("invalid_request", MISSING_ACTION_KEY, { status: 400 });
        },
      });
      const operation =
        id === "db.postgres.provision"
          ? resolveManagedDatabase(options(client))
          : resolveManagedSignIn({
              client,
              store: memory(),
              actionStore: memory(),
              keyRef: "project",
              appUrl: "http://localhost:3036",
              log: vi.fn(),
            });
      await expect(operation).rejects.toBeInstanceOf(ManagedStartupError);
      await expect(operation).rejects.toThrow(MISSING_ACTION_KEY);
    }
  );
});

test("reverting a timed-out domain change sends a new action despite the earlier confirmed address", async () => {
  const { resolveManagedSignIn } = await import("./managed-runtime");
  const client = new FakePramaan({
    "auth.backend.provision": () => backend,
    "auth.backend.domains.set": () => ({ allowedDomains: [] }),
  });
  const input = {
    client,
    store: memory(),
    actionStore: memory(),
    keyRef: "project",
    appUrl: "https://forms.example.test",
    log: vi.fn(),
  };
  await resolveManagedSignIn(input);
  client.route({
    "auth.backend.domains.set": () => {
      throw new PramaanError("upstream_timeout", "private");
    },
  });
  await expect(resolveManagedSignIn({ ...input, appUrl: "https://other.example.test" })).rejects.toThrow();
  expect((await input.store.read())?.returnOrigin).toBeUndefined();
  client.route({ "auth.backend.domains.set": () => ({ allowedDomains: [] }) });
  await resolveManagedSignIn(input);
  const calls = client.calls.filter((call) => call.id === "auth.backend.domains.set");
  expect(calls).toHaveLength(3);
  expect(new Set(calls.map((call) => call.opts?.idempotencyKey)).size).toBe(3);
  expect(calls[2].input).toEqual({ domains: ["https://forms.example.test"] });
});
