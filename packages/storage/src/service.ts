import { logger } from "@forms/logger";
import { PramaanError, idempotencyKey, isUnavailable, safeActionFailureReason } from "@forms/pramaan";
import { ensureBucket, storageClient } from "./client";
import { STORAGE_BUCKET_NAME } from "./constants";
import { deleteLocalFile, deleteLocalPrefix, localSignedUrl, readLocalFile, usesLocalStorage } from "./local";
import { type Result, type StorageError, StorageErrorCode, err, ok } from "./types/error";

const errorToStorageError = (error: unknown): StorageError => {
  if (error instanceof PramaanError && error.code === "not_found") {
    return { code: StorageErrorCode.FileNotFoundError };
  }
  if (isUnavailable(error)) return { code: StorageErrorCode.Unavailable };
  return { code: StorageErrorCode.Unknown };
};

/**
 * Get a signed URL for uploading one file. The uploader PUTs the raw bytes to
 * the URL with the file's media type; the size cap is enforced by the caller
 * before it uploads.
 */
export const getSignedUploadUrl = async (
  fileName: string,
  _contentType: string,
  filePath: string,
  _maxSize: number = 1024 * 1024 * 10 // 10MB
): Promise<
  Result<
    {
      signedUrl: string;
      /** Always empty with the PUT upload flow; kept for caller compatibility. */
      presignedFields: Record<string, string>;
    },
    StorageError
  >
> => {
  if (usesLocalStorage()) {
    try {
      return ok({
        signedUrl: localSignedUrl(`${filePath}/${fileName}`, "PUT", _contentType, _maxSize),
        presignedFields: {},
      });
    } catch {
      return err({ code: StorageErrorCode.InvalidInput });
    }
  }
  const client = storageClient();
  if (!client) {
    return err({ code: StorageErrorCode.NotConfigured });
  }
  if (!(await ensureBucket())) {
    return err({ code: StorageErrorCode.Unavailable });
  }
  try {
    const result = (await client.call(
      "storage.object.upload-url",
      {
        bucket: STORAGE_BUCKET_NAME,
        path: `${filePath}/${fileName}`,
        overwrite: true,
      },
      { idempotencyKey: idempotencyKey() }
    )) as { uploadUrl: string };
    return ok({ signedUrl: result.uploadUrl, presignedFields: {} });
  } catch (error) {
    logger.error({ message: safeActionFailureReason(error) }, "Failed to get signed upload URL");
    return err(errorToStorageError(error));
  }
};

/**
 * Get a short-lived signed URL for downloading one file.
 */
export const getSignedDownloadUrl = async (fileKey: string): Promise<Result<string, StorageError>> => {
  if (usesLocalStorage()) {
    try {
      const file = await readLocalFile(fileKey);
      await file.body.cancel();
      return ok(localSignedUrl(fileKey, "GET"));
    } catch (error) {
      return err({
        code:
          (error as NodeJS.ErrnoException).code === "ENOENT"
            ? StorageErrorCode.FileNotFoundError
            : StorageErrorCode.InvalidInput,
      });
    }
  }
  const client = storageClient();
  if (!client) {
    return err({ code: StorageErrorCode.NotConfigured });
  }
  try {
    const result = (await client.call("storage.object.download-url", {
      bucket: STORAGE_BUCKET_NAME,
      path: fileKey,
      expiresIn: 60 * 30,
    })) as { downloadUrl: string };
    return ok(result.downloadUrl);
  } catch (error) {
    logger.error({ message: safeActionFailureReason(error) }, "Failed to get signed download URL");
    return err(errorToStorageError(error));
  }
};

export interface FileStreamResult {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength: number;
}

/**
 * Get a file's bytes as a stream, by fetching the signed download URL
 * server-side. Use this when the caller needs the content itself (archives);
 * callers that only serve the file should redirect to a download URL instead.
 */
export const getFileStream = async (fileKey: string): Promise<Result<FileStreamResult, StorageError>> => {
  if (usesLocalStorage()) {
    try {
      return ok(await readLocalFile(fileKey));
    } catch (error) {
      return err({
        code:
          (error as NodeJS.ErrnoException).code === "ENOENT"
            ? StorageErrorCode.FileNotFoundError
            : StorageErrorCode.InvalidInput,
      });
    }
  }
  const urlResult = await getSignedDownloadUrl(fileKey);
  if (!urlResult.ok) return urlResult;
  try {
    const response = await fetch(urlResult.data);
    if (response.status === 404) {
      return err({ code: StorageErrorCode.FileNotFoundError });
    }
    if (!response.ok || !response.body) {
      logger.error({ status: response.status }, "Storage did not return the file");
      return err({ code: StorageErrorCode.Unknown });
    }
    return ok({
      body: response.body,
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
      contentLength: Number(response.headers.get("content-length") ?? 0),
    });
  } catch (error) {
    logger.error({ message: safeActionFailureReason(error) }, "Failed to fetch file");
    return err({ code: StorageErrorCode.Unknown });
  }
};

/**
 * Delete one file.
 */
export const deleteFile = async (fileKey: string): Promise<Result<void, StorageError>> => {
  if (usesLocalStorage()) {
    try {
      await deleteLocalFile(fileKey);
      return ok(undefined);
    } catch {
      return err({ code: StorageErrorCode.FileNotFoundError });
    }
  }
  const client = storageClient();
  if (!client) {
    return err({ code: StorageErrorCode.NotConfigured });
  }
  try {
    await client.call(
      "storage.object.delete",
      {
        bucket: STORAGE_BUCKET_NAME,
        paths: [fileKey],
      },
      { idempotencyKey: idempotencyKey() }
    );
    return ok(undefined);
  } catch (error) {
    logger.error({ message: safeActionFailureReason(error) }, "Failed to delete file");
    return err(errorToStorageError(error));
  }
};

/**
 * Delete all files under a prefix. Pages through the object list and deletes
 * in batches of 100 paths.
 */
export const deleteFilesByPrefix = async (prefix: string): Promise<Result<void, StorageError>> => {
  if (usesLocalStorage()) {
    try {
      await deleteLocalPrefix(prefix);
      return ok(undefined);
    } catch {
      return err({ code: StorageErrorCode.InvalidInput });
    }
  }
  const client = storageClient();
  if (!client) {
    return err({ code: StorageErrorCode.NotConfigured });
  }

  const normalizedPrefix = prefix.trim();
  if (!normalizedPrefix || normalizedPrefix === "/") {
    logger.error({ prefix }, "Refusing to delete files with an empty or root prefix");
    return err({
      code: StorageErrorCode.InvalidInput,
    });
  }

  try {
    const paths: string[] = [];
    let cursor: string | undefined;
    // The list call walks at most ten storage pages per call; keep calling
    // until it reports no next cursor.
    for (let page = 0; page < 1000; page++) {
      const result = (await client.call("storage.objects.list", {
        bucket: STORAGE_BUCKET_NAME,
        prefix: normalizedPrefix,
        limit: 1000,
        ...(cursor ? { cursor } : {}),
      })) as { results?: ReadonlyArray<{ path: string; isFolder?: boolean }>; nextCursor?: string | null };
      for (const row of result.results ?? []) {
        if (!row.isFolder) paths.push(row.path);
      }
      cursor = result.nextCursor ?? undefined;
      if (!cursor) break;
    }

    for (let i = 0; i < paths.length; i += 100) {
      await client.call(
        "storage.object.delete",
        {
          bucket: STORAGE_BUCKET_NAME,
          paths: paths.slice(i, i + 100),
        },
        { idempotencyKey: idempotencyKey() }
      );
    }

    return ok(undefined);
  } catch (error) {
    logger.error({ message: safeActionFailureReason(error) }, "Failed to delete files by prefix");
    return err(errorToStorageError(error));
  }
};
