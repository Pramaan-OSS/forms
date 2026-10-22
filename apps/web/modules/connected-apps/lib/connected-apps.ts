import "server-only";
import Ajv from "ajv";
import { createHash } from "node:crypto";
import { type CapId, idempotencyKey as newActionKey } from "@forms/pramaan";
import { pramaan } from "@/lib/pramaan";

/**
 * The one module for the connected-apps capabilities. A person connects their
 * own account (the access is broad — never call it read-only); this app then
 * finds actions in the catalogue and runs them for that person.
 */

const CAPS = {
  catalogSearch: "apps.catalog.search",
  connectionStart: "apps.connection.start",
  connectionsList: "apps.connections.list",
  actionExecute: "apps.action.execute",
} as const satisfies Record<string, CapId>;

/**
 * The person's stable reference on the platform: a hash of this app's user id,
 * never an email or a name. Pramaan stores only a hash of it anyway.
 */
export const endUserRefFor = (userId: string): string =>
  `u_${createHash("sha256").update(userId).digest("hex").slice(0, 32)}`;

export interface CatalogEntry {
  readonly app: string;
  readonly action: string;
  readonly description?: string;
  readonly inputSchema?: Record<string, unknown>;
}

/** The catalogue's actions for what you want to do, in plain words. */
export const searchConnectedAppActions = async (query: string, app?: string): Promise<CatalogEntry[]> => {
  if (!pramaan) return [];
  const entries: CatalogEntry[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const result = (await pramaan.call(CAPS.catalogSearch, {
      query,
      ...(app ? { app } : {}),
      limit: 50,
      ...(cursor ? { cursor } : {}),
    })) as { results?: CatalogEntry[]; nextCursor?: string };
    entries.push(...(result.results ?? []));
    if (!result.nextCursor) return entries;
    cursor = result.nextCursor;
  }
  throw new Error("Narrow the action search and try again.");
};

/**
 * The address to send the person to so they can connect their account. The
 * access is the app's standard one and it is broad; the connect screen says so.
 */
export const startAppConnection = async (
  userId: string,
  app: string,
  redirectUrl: string
): Promise<string> => {
  if (!pramaan) throw new Error("This feature is not available yet.");
  const result = (await pramaan.call(
    CAPS.connectionStart,
    {
      endUserRef: endUserRefFor(userId),
      app,
      redirectUrl,
    },
    { idempotencyKey: newActionKey() }
  )) as { connectUrl?: string };
  if (!result.connectUrl) throw new Error("The connect reply carried no address.");
  return result.connectUrl;
};

export interface AppConnection {
  readonly app: string;
  readonly status: string;
}

/** The person's connections to one app, or all of them. */
export const listAppConnections = async (userId: string, app?: string): Promise<AppConnection[]> => {
  if (!pramaan) return [];
  const result = (await pramaan.call(CAPS.connectionsList, {
    endUserRef: endUserRefFor(userId),
    ...(app ? { app } : {}),
  })) as { results?: AppConnection[] };
  return result.results ?? [];
};

export interface AppActionResult {
  readonly status: "succeeded" | "failed";
  readonly output: unknown;
  readonly error?: string;
}

/** Run one catalogue action for the person. No retry: an action may have acted. */
export const executeAppAction = async (
  userId: string,
  action: string,
  input: Record<string, unknown>,
  idempotencyKey?: string
): Promise<AppActionResult> => {
  if (!pramaan) throw new Error("This feature is not available yet.");
  return (await pramaan.call(
    CAPS.actionExecute,
    {
      endUserRef: endUserRefFor(userId),
      action,
      input,
    },
    { idempotencyKey: idempotencyKey ?? newActionKey() }
  )) as AppActionResult;
};

/** The apps this product offers to connect, with their catalogue names. */
export const OFFERED_APPS = ["googlesheets", "airtable", "notion", "slack"] as const;
export type OfferedApp = (typeof OFFERED_APPS)[number];
export const isOfferedApp = (value: string): value is OfferedApp =>
  (OFFERED_APPS as readonly string[]).includes(value);

/** Catalogue schemas are data; never resolve external references or fetch formats. */
export function validateActionInput(schema: Record<string, unknown> | undefined, input: unknown): boolean {
  if (!schema) return false;
  try {
    return new Ajv({ strict: false, validateFormats: false }).compile(schema)(input) === true;
  } catch {
    return false;
  }
}
