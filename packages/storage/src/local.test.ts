import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { handleLocalStorageRequest, localSignedUrl, verifyLocalTicket } from "./local";
import { deleteFilesByPrefix, getFileStream, getSignedDownloadUrl, getSignedUploadUrl } from "./service";

const scratch = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.scratch",
  `storage-${randomUUID()}`
);
beforeEach(async () => {
  vi.stubEnv("FORMS_STORAGE_DRIVER", "local");
  vi.stubEnv("FORMS_UPLOAD_DIR", scratch);
  vi.stubEnv("ENCRYPTION_KEY", "test-signing-secret");
  await mkdir(scratch, { recursive: true });
});
afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
test("the unchanged storage API uploads and streams from local disk without a key", async () => {
  vi.stubEnv("PRAMAAN_API_KEY", "");
  const link = await getSignedUploadUrl("example.txt", "text/plain", "workspace/private", 20);
  expect(link.ok).toBe(true);
  if (!link.ok) return;
  const upload = await handleLocalStorageRequest(
    new Request(link.data.signedUrl, { method: "PUT", body: "Local file" })
  );
  expect(upload.status).toBe(204);
  const download = await getSignedDownloadUrl("workspace/private/example.txt");
  expect(download.ok).toBe(true);
  if (!download.ok) return;
  const reply = await handleLocalStorageRequest(new Request(download.data));
  expect(await reply.text()).toBe("Local file");
  expect(reply.headers.get("Content-Disposition")).toBe("attachment");
  const stream = await getFileStream("workspace/private/example.txt");
  expect(stream.ok).toBe(true);
  if (stream.ok) expect(await new Response(stream.data.body).text()).toBe("Local file");
  await deleteFilesByPrefix("workspace");
  expect((await getSignedDownloadUrl("workspace/private/example.txt")).ok).toBe(false);
});
test("rejects forged, expired and wrong-method links", () => {
  const token = new URL(localSignedUrl("workspace/private/file.txt", "PUT")).searchParams.get("token")!;
  expect(() => verifyLocalTicket(token + "bad", "PUT")).toThrow();
  expect(() => verifyLocalTicket(token, "GET")).toThrow();
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 31 * 60 * 1000);
  expect(() => verifyLocalTicket(token, "PUT")).toThrow();
  vi.useRealTimers();
});
test("refuses traversal and root deletion", async () => {
  for (const key of ["../secret", "workspace/../secret", "/absolute", "workspace//file", "workspace\\file"])
    expect(() => localSignedUrl(key, "PUT")).toThrow();
  expect((await deleteFilesByPrefix("/")).ok).toBe(false);
});
test("enforces the signed size even without a content-length header", async () => {
  const url = localSignedUrl("workspace/private/file.txt", "PUT", "text/plain", 3);
  const reply = await handleLocalStorageRequest(new Request(url, { method: "PUT", body: "too long" }));
  expect(reply.ok).toBe(false);
  expect((await getSignedDownloadUrl("workspace/private/file.txt")).ok).toBe(false);
});
