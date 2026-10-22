import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export const usesLocalStorage = () => process.env.FORMS_STORAGE_DRIVER !== "pramaan";
const root = () => path.resolve(process.env.FORMS_UPLOAD_DIR || path.join(process.cwd(), ".data", "uploads"));
const filePath = (key: string) => {
  if (
    !key ||
    key.includes("\\") ||
    key.includes("\0") ||
    key.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Invalid file path.");
  const file = path.resolve(root(), key);
  if (!file.startsWith(root() + path.sep)) throw new Error("Invalid file path.");
  return file;
};
const secret = () => {
  const value = process.env.ENCRYPTION_KEY;
  if (!value) throw new Error("Storage signing is not configured.");
  return value;
};
type Ticket = { key: string; method: "GET" | "PUT"; expires: number; maxSize: number; contentType: string };
const signature = (encoded: string) => createHmac("sha256", secret()).update(encoded).digest("base64url");
export function localSignedUrl(
  key: string,
  method: "GET" | "PUT",
  contentType = "application/octet-stream",
  maxSize = 10 * 1024 * 1024
) {
  filePath(key);
  const ticket: Ticket = { key, method, contentType, maxSize, expires: Date.now() + 30 * 60 * 1000 };
  const encoded = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  const token = `${encoded}.${signature(encoded)}`;
  return `${process.env.WEBAPP_URL || "http://localhost:3000"}/api/storage/local?token=${encodeURIComponent(token)}`;
}
export function verifyLocalTicket(token: string, method: string): Ticket {
  if (token.length > 8192) throw new Error("Invalid upload link.");
  const [encoded, supplied, ...extra] = token.split(".");
  if (!encoded || !supplied || extra.length) throw new Error("Invalid upload link.");
  const expected = Buffer.from(signature(encoded));
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    throw new Error("Invalid upload link.");
  const ticket = JSON.parse(Buffer.from(encoded, "base64url").toString()) as Ticket;
  if (
    ticket.method !== method ||
    ticket.expires < Date.now() ||
    !Number.isSafeInteger(ticket.maxSize) ||
    ticket.maxSize < 1 ||
    ticket.maxSize > 1024 * 1024 * 1024
  )
    throw new Error("Upload link expired or invalid.");
  filePath(ticket.key);
  return ticket;
}
export async function writeLocalFile(
  key: string,
  body: ReadableStream<Uint8Array> | null,
  maxSize: number,
  contentType: string
) {
  if (!body) throw new Error("File body required.");
  const target = filePath(key);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.partial`;
  const file = await open(temporary, "wx", 0o600);
  const reader = body.getReader();
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxSize) throw new Error("File too large.");
      await file.writeFile(value);
    }
    await file.close();
    await writeFile(`${target}.metadata`, JSON.stringify({ contentType }), { mode: 0o600 });
    await rename(temporary, target);
  } catch (error) {
    await file.close().catch(() => {});
    await unlink(temporary).catch(() => {});
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
export async function readLocalFile(key: string) {
  const target = filePath(key);
  const info = await stat(target);
  const metadata = JSON.parse(await readFile(`${target}.metadata`, "utf8")) as { contentType: string };
  return {
    body: Readable.toWeb(createReadStream(target)) as ReadableStream<Uint8Array>,
    contentType: metadata.contentType,
    contentLength: info.size,
  };
}
export async function deleteLocalFile(key: string) {
  const target = filePath(key);
  await unlink(target);
  await unlink(`${target}.metadata`).catch(() => {});
}
export async function deleteLocalPrefix(prefix: string) {
  const target = filePath(prefix.replace(/\/$/, ""));
  await rm(target, { recursive: true, force: true });
}
/** This handler only accepts short-lived links minted after the normal upload/download authorization checks. */
export async function handleLocalStorageRequest(request: Request): Promise<Response> {
  if (!usesLocalStorage()) return new Response("Local storage is off.", { status: 404 });
  let ticket: Ticket;
  try {
    ticket = verifyLocalTicket(new URL(request.url).searchParams.get("token") ?? "", request.method);
  } catch {
    return new Response("File link expired or invalid.", { status: 403 });
  }
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  try {
    if (request.method === "PUT") {
      const declared = Number(request.headers.get("content-length"));
      if (declared > ticket.maxSize) return new Response("File too large.", { status: 413, headers });
      await writeLocalFile(ticket.key, request.body, ticket.maxSize, ticket.contentType);
      return new Response(null, { status: 204, headers });
    }
    const file = await readLocalFile(ticket.key);
    const safeImage = /^image\/(png|jpeg|gif|webp|avif)$/.test(file.contentType);
    return new Response(file.body, {
      headers: {
        ...headers,
        "Content-Type": file.contentType,
        "Content-Length": String(file.contentLength),
        "Content-Disposition": safeImage ? "inline" : "attachment",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return new Response("File not found.", { status: 404, headers });
    return new Response("Could not store or read this file.", { status: 400, headers });
  }
}
