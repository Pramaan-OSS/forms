import { handleLocalStorageRequest } from "@forms/storage";

export const runtime = "nodejs";
export const GET = handleLocalStorageRequest;
export const PUT = handleLocalStorageRequest;
export const OPTIONS = () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
