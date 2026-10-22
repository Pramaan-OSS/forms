// Requests and results for the capabilities this product calls. Shapes follow the
// platform's capability contracts; only the fields this product uses are kept.
// `llm.chat` / `llm.complete` take `messages` (never a bare prompt) and a
// `maxTokens` of 64 or more; tool `parameters` / `jsonSchema` must fit the
// bounded subset enforced in json-schema.ts.
import type { JsonObject } from "./json";

export type Message = {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
  readonly toolCallId?: string;
  readonly name?: string;
};

export type ToolDef = {
  readonly name: string;
  readonly description?: string;
  /** Bounded-subset JSON Schema; root must be an object. */
  readonly parameters: Record<string, unknown>;
};

export namespace Caps {
  export interface LlmRequest {
    readonly messages: ReadonlyArray<Message>;
    /** 64 or more. */
    readonly maxTokens?: number;
    /** Randomness from 0 (steady) to 2 (varied). */
    readonly temperature?: number;
    readonly tools?: ReadonlyArray<ToolDef>;
    readonly jsonSchema?: Record<string, unknown>;
  }
  export interface LlmResult {
    readonly text?: string;
    readonly finishReason?: string;
    readonly usage?: { readonly inputTokens: number; readonly outputTokens: number };
    readonly toolCalls?: ReadonlyArray<{
      readonly id: string;
      readonly name: string;
      readonly arguments: JsonObject;
    }>;
  }

  // email.send contract adopted from lab e0922353.
  export interface EmailInvitation {
    readonly uid: string;
    readonly title: string;
    readonly start: string;
    readonly end: string;
    readonly timeZone: string;
    readonly organiser: string;
    readonly attendees: ReadonlyArray<string>;
    readonly method: "request" | "cancel";
    readonly location?: string;
    readonly description?: string;
    readonly sequence?: number;
  }

  export interface EmailSendRequest {
    readonly to: ReadonlyArray<string>;
    readonly subject: string;
    readonly text?: string;
    readonly html?: string;
    readonly from: string;
    readonly cc?: string | ReadonlyArray<string>;
    readonly bcc?: string | ReadonlyArray<string>;
    readonly replyTo?: string;
    /** At most 10 uploaded files, 6 MB combined including invitation. */
    readonly attachments?: ReadonlyArray<{ fileId: string; name: string }>;
    readonly invitation?: EmailInvitation;
  }
  export interface EmailSendResult {
    readonly ref?: string;
    readonly id?: string;
    readonly status?: string;
  }

  export interface EmailTemplateSendRequest {
    readonly ref: string;
    readonly from: { email: string; name?: string };
    readonly to: { email: string; name?: string };
    readonly cc?: ReadonlyArray<{ email: string; name?: string }>;
    readonly bcc?: ReadonlyArray<{ email: string; name?: string }>;
    readonly replyTo?: ReadonlyArray<{ email: string; name?: string }>;
    readonly variables?: Readonly<Record<string, string>>;
    readonly attachments?: ReadonlyArray<{ fileId: string; name: string }>;
    readonly autoSubmitted?: "auto-generated" | "auto-replied";
  }

  export interface AppsCatalogSearchRequest {
    readonly app?: string;
    readonly query?: string;
    readonly cursor?: string;
    readonly limit?: number;
  }
  export interface AppsCatalogSearchResult {
    readonly results?: ReadonlyArray<JsonObject>;
    readonly actions?: ReadonlyArray<JsonObject>;
    readonly nextCursor?: string | null;
  }

  export interface AppsConnectionStartRequest {
    readonly app: string;
    readonly endUserRef: string;
    readonly redirectUrl: string;
    readonly access?: "read" | "read-write";
  }
  export interface AppsConnectionsListRequest {
    readonly endUserRef: string;
  }
  export interface AppsActionExecuteRequest {
    readonly action: string;
    readonly endUserRef: string;
    readonly input: JsonObject;
  }
}
