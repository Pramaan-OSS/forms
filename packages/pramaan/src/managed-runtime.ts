import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { safeActionFailureReason } from "./action-policy";
import { type Pramaan, PramaanError } from "./index";

export type RuntimeClient = Pick<Pramaan, "call">;
export interface RuntimeStore {
  read(): Promise<Record<string, unknown> | undefined>;
  write(value: Record<string, unknown>): Promise<void>;
}

/** Private atomic storage: never log the stored values or parse failures. */
export function privateRuntimeStore(file: string): RuntimeStore {
  return {
    async read() {
      try {
        await chmod(file, 0o600);
        const value: unknown = JSON.parse(await readFile(file, "utf8"));
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
        return value as Record<string, unknown>;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw new Error("Saved startup settings could not be read.");
      }
    },
    async write(value) {
      const directory = path.dirname(file);
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await chmod(directory, 0o700);
      const temporary = `${file}.${randomUUID()}`;
      try {
        await writeFile(temporary, JSON.stringify(value), { mode: 0o600, flag: "wx" });
        await rename(temporary, file);
      } catch {
        throw new Error("Startup settings could not be saved.");
      }
    },
  };
}

/** A startup refusal contains only a fixed local reason, never upstream response text. */
export class ManagedStartupError extends Error {}

/** Persist before sending: a failed response or process restart must reuse the same action. */
async function startupActionKey(store: RuntimeStore, operation: string, scope: unknown): Promise<string> {
  const values = (await store.read()) ?? {};
  const scopeHash = createHash("sha256").update(JSON.stringify(scope)).digest("hex");
  const saved = values[operation] as { scope?: unknown; key?: unknown } | undefined;
  if (saved !== undefined) {
    if (
      !saved ||
      typeof saved.scope !== "string" ||
      !/^[0-9a-f]{64}$/.test(saved.scope) ||
      typeof saved.key !== "string" ||
      !saved.key.startsWith(`${operation}-`) ||
      !/^[a-z-]+[0-9a-f-]{36}$/.test(saved.key)
    )
      throw new Error("Saved startup request identifiers could not be read.");
    if (saved.scope === scopeHash) return saved.key;
  }
  const key = `${operation}-${randomUUID()}`;
  await store.write({ ...values, [operation]: { scope: scopeHash, key } });
  return key;
}

export const runtimeKeyRef = (key: string): string => createHash("sha256").update(key).digest("hex");

const connectionAddress = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    return ["postgresql:", "postgres:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

export async function resolveManagedDatabase({
  client,
  store,
  actionStore,
  keyRef,
  localConnectionString,
  log,
}: {
  client: RuntimeClient | null;
  store: RuntimeStore;
  actionStore: RuntimeStore;
  keyRef: string | undefined;
  localConnectionString: string;
  log: (line: string) => void;
}): Promise<{ connectionString: string; directConnectionString: string; managed: boolean }> {
  const saved = await store.read();
  if (saved) {
    if (
      (keyRef !== undefined && saved.keyRef !== keyRef) ||
      !connectionAddress(saved.connectionString) ||
      !connectionAddress(saved.directConnectionString)
    ) {
      throw new Error("Saved database settings do not match this startup. Keep the private settings file.");
    }
    return {
      connectionString: saved.connectionString,
      directConnectionString: saved.directConnectionString,
      managed: true,
    };
  }
  if (!client)
    return {
      connectionString: localConnectionString,
      directConnectionString: localConnectionString,
      managed: false,
    };
  const actionKey = await startupActionKey(actionStore, "managed-database", keyRef);
  let result: { created?: boolean; connectionString?: string; directConnectionString?: string };
  try {
    result = (await client.call("db.postgres.provision", {}, { idempotencyKey: actionKey })) as typeof result;
  } catch (error) {
    if (error instanceof PramaanError && error.code === "upstream_unavailable") {
      log("Managed database is unavailable; using the bundled local database.");
      return {
        connectionString: localConnectionString,
        directConnectionString: localConnectionString,
        managed: false,
      };
    }
    throw new ManagedStartupError(
      `Managed database setup could not be confirmed. ${safeActionFailureReason(error)} Keep any saved startup settings.`
    );
  }
  if (
    result?.created !== true ||
    !connectionAddress(result.connectionString) ||
    !connectionAddress(result.directConnectionString)
  ) {
    throw new Error(
      "Managed database credentials are unavailable. Restore the saved settings before starting."
    );
  }
  await store.write({
    keyRef,
    connectionString: result.connectionString,
    directConnectionString: result.directConnectionString,
  });
  return {
    connectionString: result.connectionString,
    directConnectionString: result.directConnectionString,
    managed: true,
  };
}

export interface ManagedSignInBackend {
  authUrl: string;
  jwksUrl: string;
}
const secureAddress = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
};

/** Development loopback is allowed by the backend; only public HTTPS origins are configured. */
export function managedReturnOrigin(appUrl: string): string | undefined {
  const url = new URL(appUrl);
  const host = url.hostname;
  if (
    url.protocol !== "https:" ||
    !host.includes(".") ||
    /^[\d.]+$/.test(host) ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.includes(":")
  )
    return undefined;
  return url.origin;
}

export async function resolveManagedSignIn({
  client,
  store,
  actionStore,
  keyRef,
  appUrl,
  log,
}: {
  client: RuntimeClient;
  store: RuntimeStore;
  actionStore: RuntimeStore;
  keyRef: string;
  appUrl: string;
  log: (line: string) => void;
}): Promise<ManagedSignInBackend | null> {
  let saved = await store.read();
  if (saved && saved.keyRef !== keyRef) saved = undefined;
  let backend: ManagedSignInBackend;
  if (saved && secureAddress(saved.authUrl) && secureAddress(saved.jwksUrl)) {
    backend = { authUrl: saved.authUrl, jwksUrl: saved.jwksUrl };
  } else {
    const actionKey = await startupActionKey(actionStore, "managed-signin", keyRef);
    try {
      const result = (await client.call("auth.backend.provision", {}, { idempotencyKey: actionKey })) as {
        status?: string;
        authUrl?: string;
        jwksUrl?: string;
      };
      if (result.status !== "ready" || !secureAddress(result.authUrl) || !secureAddress(result.jwksUrl))
        throw new Error();
      backend = { authUrl: result.authUrl, jwksUrl: result.jwksUrl };
    } catch (error) {
      if (error instanceof PramaanError && error.code === "upstream_unavailable") {
        log("Managed sign-in is unavailable; using local sign-in.");
        return null;
      }
      throw new ManagedStartupError(
        `Managed sign-in setup could not be confirmed. ${safeActionFailureReason(error)}`
      );
    }
    // Save provision before setting domains; a later failure must not lose the backend.
    saved = { keyRef, ...backend };
    await store.write(saved);
  }
  const origin = managedReturnOrigin(appUrl);
  if (!origin) log("Managed sign-in return domains were not set for this local address.");
  else if (saved?.returnOrigin !== origin) {
    const actionKey = await startupActionKey(actionStore, "managed-signin-domains", [
      keyRef,
      backend.authUrl,
      origin,
    ]);
    // A timed-out change may have acted. Do not treat the previous origin as confirmed.
    await store.write({ keyRef, ...backend });
    try {
      await client.call("auth.backend.domains.set", { domains: [origin] }, { idempotencyKey: actionKey });
    } catch (error) {
      throw new ManagedStartupError(
        `Managed sign-in return address could not be configured. ${safeActionFailureReason(error)}`
      );
    }
    await store.write({ keyRef, ...backend, returnOrigin: origin });
  }
  return backend;
}

/** Read signed claims only after verification, and bind them to the verified subject. */
export async function verifyManagedToken(
  client: RuntimeClient,
  backend: ManagedSignInBackend,
  token: string,
  appUrl: string
) {
  if (typeof token !== "string" || !token || token.length > 8192)
    throw new Error("Sign-in could not be verified.");
  const result = (await client.call("auth.token.verify", {
    token,
    audience: new URL(backend.authUrl).origin,
    authorizedParties: [new URL(appUrl).origin],
  })) as { valid?: boolean; userId?: string; expiresAt?: string };
  if (result.valid !== true || !result.userId || !/^[A-Za-z0-9_-]{1,128}$/.test(result.userId))
    throw new Error("Sign-in could not be verified.");
  let user: {
    sub?: unknown;
    email?: unknown;
    emailVerified?: unknown;
    email_verified?: unknown;
    name?: unknown;
  };
  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error();
    user = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!user || typeof user !== "object") throw new Error();
  } catch {
    throw new Error("Sign-in could not be verified.");
  }
  if (
    user.sub !== result.userId ||
    typeof user.email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)
  )
    throw new Error("Sign-in could not be verified.");
  return {
    subjectId: `managed:${new URL(backend.authUrl).origin}:${result.userId}`,
    providerKey: "managed",
    email: user.email,
    emailVerified: user.emailVerified === true || user.email_verified === true,
    displayName: typeof user.name === "string" ? user.name : undefined,
  };
}
