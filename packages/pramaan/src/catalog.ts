// The capabilities this product uses, with the traits the client needs offline: which are
// read_only (safe to retry) and which run as async jobs. Ids are real; see the capabilities
// catalogue. Effect classes per capability family:
//
//   read_only               email.status, email.attachment.*, auth.social.exchange, auth.enterprise.*,
//                           auth.bot-check.verify, storage.object.get, storage.object.download-url,
//                           storage.buckets.list, llm.*, apps.catalog.search, apps.connections.list,
//                           people.email.*, text.*, image.search, brand.*, companies.enrich
//   external_reversible     auth.enterprise-connection.*, storage.object.upload-url, storage.upload.create,
//                           storage.upload.part.put, apps.connection.start
//   external_irreversible   email.send, email.template.send, storage.object.put, storage.object.delete,
//                           storage.upload.complete, storage.upload.abort, apps.action.execute,
//                           apps.connection.revoke
import type { CapabilityInfo } from "./sdk/types";

type Entry = {
  description: string;
  effectClass: CapabilityInfo["effectClass"];
  mode: CapabilityInfo["mode"];
  needsConnection: boolean;
};

const R = (description: string): Entry => ({
  description,
  effectClass: "read_only",
  mode: "sync",
  needsConnection: false,
});
const RC = (description: string): Entry => ({
  description,
  effectClass: "read_only",
  mode: "sync",
  needsConnection: true,
});
const RA = (description: string): Entry => ({
  description,
  effectClass: "read_only",
  mode: "async",
  needsConnection: false,
});
const RAC = (description: string): Entry => ({
  description,
  effectClass: "read_only",
  mode: "async",
  needsConnection: true,
});
const REV = (description: string): Entry => ({
  description,
  effectClass: "external_reversible",
  mode: "sync",
  needsConnection: false,
});
const REVC = (description: string): Entry => ({
  description,
  effectClass: "external_reversible",
  mode: "sync",
  needsConnection: true,
});
const IRR = (description: string): Entry => ({
  description,
  effectClass: "external_irreversible",
  mode: "sync",
  needsConnection: false,
});
const IRRA = (description: string): Entry => ({
  description,
  effectClass: "external_irreversible",
  mode: "async",
  needsConnection: false,
});

const TABLE: Record<string, Entry> = {
  "db.postgres.provision": REV("Provision a managed database; connection strings are returned once."),
  "auth.backend.provision": REV("Provision or reuse managed sign-in for this app."),
  "auth.backend.domains.set": REV("Set the app origins allowed to return from managed sign-in."),
  "auth.token.verify": R("Verify the signed-in user's token."),
  "auth.user.delete": IRR("Delete the confirmed managed sign-in account."),
  "email.send": IRR("Send one email to up to 50 recipients."),
  "email.template.send": IRR("Send a stored email template to recipients."),
  "email.status": R("Delivery status of a sent email."),
  "email.attachment.from-url": R("Fetch a public file as an email attachment object (max 6 MB)."),
  "email.attachment.get": R("Read one attachment of a message as base64 (max 6 MB)."),
  "storage.buckets.list": R("List the buckets in your own file storage."),
  "storage.bucket.create": REV("Create a private bucket in your own storage account."),
  "storage.object.head": R("Read the size and media type of an object without downloading it."),
  "storage.object.put": IRRA("Store a file up to 25 MB in your own bucket (job over 1 MiB inline)."),
  "storage.object.get": RA("Download up to 25 MB from your storage."),
  "storage.object.delete": IRR("Permanently delete up to 100 files by path from your own file storage."),
  "storage.object.upload-url": REV("Create a short-lived signed URL that uploads one file."),
  "storage.object.download-url": R("Create a short-lived signed URL that downloads one file."),
  "storage.objects.list": R("List files and folders in a bucket of your own file storage."),
  "storage.upload.create": REV("Start a multipart upload of an object in your bucket."),
  "storage.upload.part.put": REVC("Store one part of a multipart upload, at most 8 MiB."),
  "storage.upload.complete": IRR("Complete an upload from its stored parts."),
  "storage.upload.abort": IRR("Discard all parts of an unfinished upload."),
  "llm.chat": R("Generate one stateless conversation turn with text and/or tool calls."),
  "llm.complete": R("Generate a text reply to a chat of messages."),
  "llm.complete-bulk": RA("Generate text replies for up to 16 message rows as a job."),
  "auth.bot-check.verify": R("Verify a single-use client challenge token."),
  "auth.social.exchange": R("Redeem a single-use social sign-in code and return the identity."),
  "auth.enterprise.start": R("Start sign-in through one customer's identity provider."),
  "auth.enterprise-connection.create": REV("Save one customer's identity provider for sign-in."),
  "auth.enterprise-connection.delete": REV("Delete an enterprise sign-in connection."),
  "auth.enterprise-connections.list": R("List the enterprise sign-in connections you saved."),
  "apps.catalog.search": R("Find an app's actions on the Pramaan-run connector."),
  "apps.connection.start": REVC("Start connecting one of your end users to a third-party app."),
  "apps.connections.list": RC("List one of your end users' third-party app connections."),
  "apps.connection.revoke": IRR("Disconnect one of your end users from a third-party app."),
  "apps.action.execute": IRR("Run one action in a connected third-party app as one of your end users."),
  "people.email.validate": R("Check an email address's syntax and mail server."),
  "people.email.toxicity.check": RAC("Check a respondent address for risk signals."),
  "text.sentiment.analyze": R("The tone of a text, with scores."),
  "text.language.detect": R("Detect the language of a text."),
  "text.translate": R("Translate a text into a target language."),
  "text.classify": R("Sort a text into categories, with a confidence for each."),
  "image.search": R("Search the web for images matching a description."),
  "brand.identity.get": R("Public brand identity, company data, fonts, colors and asset metadata."),
  "brand.colors.get": RA("Brand colors with observed roles when available."),
  "companies.enrich": R("Company profile from a domain, name or professional profile URL."),
};

export const CATALOG: Record<string, CapabilityInfo> = Object.fromEntries(
  Object.entries(TABLE).map(([id, e]) => [
    id,
    {
      id,
      description: e.description,
      effectClass: e.effectClass,
      mode: e.mode,
      needsConnection: e.needsConnection,
    } satisfies CapabilityInfo,
  ])
);

const BY_ID = new Map<string, CapabilityInfo>(Object.entries(CATALOG));

/** Traits of one capability this product uses, or undefined for any other id. */
export function capabilityInfo(id: string): CapabilityInfo | undefined {
  return BY_ID.get(id);
}
