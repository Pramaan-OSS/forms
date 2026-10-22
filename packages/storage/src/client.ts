import { logger } from "@forms/logger";
import { idempotencyKey, pramaanFromEnv, safeActionFailureReason } from "@forms/pramaan";
import { STORAGE_BUCKET_NAME } from "./constants";

/**
 * The one Pramaan client for file storage, built once per process from
 * PRAMAAN_API_KEY. Null when no key is configured: storage calls then answer
 * "not configured" instead of attempting a call.
 */
let cachedClient: ReturnType<typeof pramaanFromEnv> | undefined;

export const storageClient = () => {
  cachedClient ??= pramaanFromEnv();
  return cachedClient;
};

let bucketReady: Promise<boolean> | undefined;

/**
 * Make sure the workspace bucket exists. Buckets live in the key holder's own
 * storage account; the default one is created on first use, so a fresh install
 * needs nothing but the key. A failure here is remembered for the process so
 * the plain "not available" message shows instead of retrying every call.
 */
export const ensureBucket = async (): Promise<boolean> => {
  bucketReady ??= (async () => {
    const client = storageClient();
    if (!client) return false;
    try {
      const listed = (await client.call("storage.buckets.list", {
        search: STORAGE_BUCKET_NAME,
        limit: 1000,
      })) as { results?: ReadonlyArray<{ name: string }> };
      if (listed.results?.some((bucket) => bucket.name === STORAGE_BUCKET_NAME)) return true;
      await client.call(
        "storage.bucket.create",
        { name: STORAGE_BUCKET_NAME },
        { idempotencyKey: idempotencyKey() }
      );
      return true;
    } catch (error) {
      logger.error({ message: safeActionFailureReason(error) }, "Storage bucket could not be prepared");
      // Retry on the next call: the platform may simply not be reachable yet.
      bucketReady = undefined;
      return false;
    }
  })();
  return bucketReady;
};
