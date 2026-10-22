import { beforeEach, describe, expect, test, vi } from "vitest";
import { PramaanError } from "@forms/pramaan";
import {
  deleteFile,
  deleteFilesByPrefix,
  getFileStream,
  getSignedDownloadUrl,
  getSignedUploadUrl,
} from "./service";
import { StorageErrorCode } from "./types/error";

const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  client: {
    call: vi.fn<
      (id: string, input: Record<string, unknown>, opts?: { idempotencyKey: string }) => Promise<unknown>
    >(),
  },
}));

vi.mock("./client", () => ({
  storageClient: () => mocks.client,
  ensureBucket: () => Promise.resolve(true),
}));

const client = mocks.client;

describe("storage over Pramaan", () => {
  beforeEach(() => {
    vi.stubEnv("FORMS_STORAGE_DRIVER", "pramaan");
    client.call.mockReset();
  });

  test("upload URL points at the bucket path and carries no form fields", async () => {
    client.call.mockResolvedValue({ uploadUrl: "https://files.example/upload?sig=1" });
    const result = await getSignedUploadUrl("a.png", "image/png", "ws1/public");
    expect(client.call).toHaveBeenCalledWith(
      "storage.object.upload-url",
      {
        bucket: "forms",
        path: "ws1/public/a.png",
        overwrite: true,
      },
      { idempotencyKey: expect.any(String) as string }
    );
    expect(result).toEqual({
      ok: true,
      data: { signedUrl: "https://files.example/upload?sig=1", presignedFields: {} },
    });
  });

  test("download URL passes the path and expiry", async () => {
    client.call.mockResolvedValue({ downloadUrl: "https://files.example/download?sig=1" });
    const result = await getSignedDownloadUrl("ws1/public/a.png");
    expect(client.call).toHaveBeenCalledWith("storage.object.download-url", {
      bucket: "forms",
      path: "ws1/public/a.png",
      expiresIn: 1800,
    });
    expect(result).toEqual({ ok: true, data: "https://files.example/download?sig=1" });
  });

  test("a missing file maps to the file-not-found code", async () => {
    client.call.mockRejectedValue(new PramaanError("not_found", "File not found."));
    const result = await getSignedDownloadUrl("ws1/private/gone.png");
    expect(result).toEqual({ ok: false, error: { code: StorageErrorCode.FileNotFoundError } });
  });

  test("file stream fetches the signed URL server-side", async () => {
    client.call.mockResolvedValue({ downloadUrl: "https://files.example/download?sig=2" });
    const fetchMock = () =>
      Promise.resolve(
        new Response("bytes", {
          status: 200,
          headers: { "content-type": "text/plain", "content-length": "5" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await getFileStream("ws1/public/a.txt");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.contentType).toBe("text/plain");
      expect(result.data.contentLength).toBe(5);
    }
    vi.unstubAllGlobals();
  });

  test("delete removes exactly the one path", async () => {
    client.call.mockResolvedValue({ count: 1 });
    const result = await deleteFile("ws1/private/a.png");
    expect(client.call).toHaveBeenCalledWith(
      "storage.object.delete",
      {
        bucket: "forms",
        paths: ["ws1/private/a.png"],
      },
      { idempotencyKey: expect.any(String) as string }
    );
    expect(result.ok).toBe(true);
  });

  test("prefix delete walks list pages and deletes in batches of 100", async () => {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- vitest awaits returned promises
    client.call.mockImplementation((_id: string, input: Record<string, unknown>) => {
      if (_id === "storage.objects.list") {
        if (!input.cursor) {
          return Promise.resolve({
            results: Array.from({ length: 120 }, (_, i) => ({ path: `ws1/private/f${i}.png` })),
            nextCursor: "2",
          });
        }
        return Promise.resolve({
          results: [{ path: "ws1/private/last.png" }],
          nextCursor: null,
        });
      }
      return Promise.resolve({ count: 100 });
    });
    const result = await deleteFilesByPrefix("ws1/private");
    expect(result.ok).toBe(true);
    const listCalls = client.call.mock.calls.filter(([id]) => id === "storage.objects.list");
    expect(listCalls).toHaveLength(2);
    const deleteCalls = client.call.mock.calls.filter(([id]) => id === "storage.object.delete");
    expect(deleteCalls).toHaveLength(2);
    expect(deleteCalls.every((call) => Boolean(call[2]?.idempotencyKey))).toBe(true);
    expect(deleteCalls[0]?.[2]?.idempotencyKey).not.toBe(deleteCalls[1]?.[2]?.idempotencyKey);
    expect(deleteCalls[0]?.[1]).toMatchObject({ paths: { length: 100 } });
    expect(deleteCalls[1]?.[1]).toEqual({
      bucket: "forms",
      paths: [...Array.from({ length: 20 }, (_, i) => `ws1/private/f${100 + i}.png`), "ws1/private/last.png"],
    });
  });

  test("refuses a root prefix delete", async () => {
    const result = await deleteFilesByPrefix("/");
    expect(result).toEqual({ ok: false, error: { code: StorageErrorCode.InvalidInput } });
    expect(client.call).not.toHaveBeenCalled();
  });
});
