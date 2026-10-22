"use server";

import { z } from "zod";
import { ZId } from "@forms/types/common";
import { AuthorizationError } from "@forms/types/errors";
import { assertCan } from "@/lib/authorization";
import { authenticatedActionClient } from "@/lib/utils/action-client";
import { applyRateLimit } from "@/modules/core/rate-limit/helpers";
import { rateLimitConfigs } from "@/modules/core/rate-limit/rate-limit-configs";
import {
  createSharedEmbeddedData,
  deleteSharedEmbeddedData,
  getEmbeddedDataUsage,
  getEmbeddedDataWorkspaceId,
  getSharedEmbeddedData,
  promoteEmbeddedDataToShared,
  updateSharedEmbeddedData,
} from "@/modules/embedded-data/lib/library";
import {
  EmbeddedDataInUseError,
  EmbeddedDataKeyConflictError,
  type TSharedEmbeddedData,
  type TSharedEmbeddedDataWriteResult,
  ZCreateSharedEmbeddedDataInput,
  ZPromoteEmbeddedDataInput,
  ZUpdateSharedEmbeddedDataInput,
} from "@/modules/embedded-data/types";

/**
 * The shared Embedded Data library, as the manager page and the survey editor call it.
 *
 * Thin on purpose: every invariant lives in the service, and these actions only add the three things
 * a service call cannot do for itself — authorize the caller against the right workspace, bound the
 * write rate, and record what happened. Embedded Data is core, so there is no entitlement gate.
 */

/**
 * The workspace owning a field, resolved from the row.
 *
 * Single-field actions take a globally unique id and never a workspace, so the scope authorized
 * against is the row's own and cannot be supplied by the caller — the lookup is what says which
 * workspace to authorize against, and so has to happen first.
 *
 * That ordering is why a missing row raises the *authorization* refusal rather than a not-found one.
 * The action client reduces a throw to `error.message`, so two different messages here would let a
 * caller tell "no such field" from "a field you may not reach" and walk ids for free. One refusal
 * for both costs a teammate racing a concurrent delete a less precise message, which is the cheaper
 * side of the trade.
 */
const requireWorkspaceScope = async (id: string): Promise<string> => {
  const workspaceId = await getEmbeddedDataWorkspaceId(id);
  if (!workspaceId) throw new AuthorizationError("Not authorized");

  return workspaceId;
};

/**
 * Run a library write, turning its two structured refusals into the action's own payload.
 *
 * They cannot be thrown: the action client reduces a throw to `error.message`, so the surveys
 * blocking the write and the id of the row already holding a key would not survive it — see
 * `TSharedEmbeddedDataWriteResult`. A refusal also suppresses the audit event, because nothing was
 * created, updated or deleted and `withAuditLogging`'s fixed action name would otherwise record that
 * it was.
 */
const runWrite = async (
  write: () => Promise<TSharedEmbeddedData>
): Promise<TSharedEmbeddedDataWriteResult> => {
  try {
    return { status: "ok", field: await write() };
  } catch (error) {
    if (error instanceof EmbeddedDataKeyConflictError) {
      return { status: "keyConflict", existingId: error.existingId };
    }

    if (error instanceof EmbeddedDataInUseError) {
      return { status: "inUse", message: error.message, usage: error.usage };
    }

    throw error;
  }
};

const ZGetSharedEmbeddedDataAction = z.object({ workspaceId: ZId }).strict();

/** The workspace's library, each row with the number of surveys linking it. */
export const getSharedEmbeddedDataAction = authenticatedActionClient
  .inputSchema(ZGetSharedEmbeddedDataAction)
  .action(async ({ ctx, parsedInput }) => {
    await assertCan({ type: "user", id: ctx.user.id }, "workspace.read", {
      type: "workspace",
      id: parsedInput.workspaceId,
    });

    return await getSharedEmbeddedData(parsedInput.workspaceId);
  });

const ZGetEmbeddedDataUsageAction = z.object({ id: ZId }).strict();

/** The surveys linking one field — what the "used in N surveys" popover reads. */
export const getEmbeddedDataUsageAction = authenticatedActionClient
  .inputSchema(ZGetEmbeddedDataUsageAction)
  .action(async ({ ctx, parsedInput }) => {
    const workspaceId = await requireWorkspaceScope(parsedInput.id);

    await assertCan({ type: "user", id: ctx.user.id }, "workspace.read", {
      type: "workspace",
      id: workspaceId,
    });

    return await getEmbeddedDataUsage(parsedInput.id, workspaceId);
  });

const ZCreateSharedEmbeddedDataAction = ZCreateSharedEmbeddedDataInput.extend({ workspaceId: ZId });

export const createSharedEmbeddedDataAction = authenticatedActionClient
  .inputSchema(ZCreateSharedEmbeddedDataAction)
  .action(async ({ ctx, parsedInput }) => {
    const { workspaceId, ...input } = parsedInput;

    // Before the workspace is read, not after: this is the one action the caller names the
    // workspace on, so there is nothing to resolve first, and `getOrganizationIdFromWorkspaceId`
    // raises a not-found that would tell an unauthorized caller which workspace ids exist.
    await assertCan({ type: "user", id: ctx.user.id }, "workspace.write", {
      type: "workspace",
      id: workspaceId,
    });
    await applyRateLimit(rateLimitConfigs.actions.stateMutation, workspaceId);

    const result = await runWrite(() => createSharedEmbeddedData(workspaceId, input));

    if (result.status === "ok") {
    }

    return result;
  });

/**
 * `acknowledgeExistingResponses` is the user's answer to the dialog a refused `dataType` change
 * raises, so it rides with the patch rather than being a separate action: the same edit is submitted
 * both ways and only the second submission carries it.
 */
const ZUpdateSharedEmbeddedDataAction = ZUpdateSharedEmbeddedDataInput.extend({
  id: ZId,
  acknowledgeExistingResponses: z.boolean().optional(),
});

export const updateSharedEmbeddedDataAction = authenticatedActionClient
  .inputSchema(ZUpdateSharedEmbeddedDataAction)
  .action(async ({ ctx, parsedInput }) => {
    const { id, acknowledgeExistingResponses, ...patch } = parsedInput;
    const workspaceId = await requireWorkspaceScope(id);

    // Named before the permission check rather than after it: `withAuditLogging` records a
    // refused `assertCan` too, and an event that cannot say which workspace and field a probe
    // aimed at is most of an audit trail's value gone. Naming a target grants no access to it.

    await assertCan({ type: "user", id: ctx.user.id }, "workspace.write", {
      type: "workspace",
      id: workspaceId,
    });
    await applyRateLimit(rateLimitConfigs.actions.stateMutation, workspaceId);

    const result = await runWrite(() =>
      updateSharedEmbeddedData(id, workspaceId, patch, { acknowledgeExistingResponses })
    );

    return result;
  });

const ZDeleteSharedEmbeddedDataAction = z.object({ id: ZId }).strict();

export const deleteSharedEmbeddedDataAction = authenticatedActionClient
  .inputSchema(ZDeleteSharedEmbeddedDataAction)
  .action(async ({ ctx, parsedInput }) => {
    const { id } = parsedInput;
    const workspaceId = await requireWorkspaceScope(id);

    await assertCan({ type: "user", id: ctx.user.id }, "workspace.write", {
      type: "workspace",
      id: workspaceId,
    });
    await applyRateLimit(rateLimitConfigs.actions.stateMutation, workspaceId);

    const result = await runWrite(() => deleteSharedEmbeddedData(id, workspaceId));

    // A delete has no "after", so the removed row is the whole record of what happened.

    return result;
  });

const ZPromoteEmbeddedDataToSharedAction = ZPromoteEmbeddedDataInput.extend({ id: ZId });

/**
 * Audited as an update rather than a create: promote edits the ownership columns of a row that
 * already exists, and the survey keeps its link to it.
 */
export const promoteEmbeddedDataToSharedAction = authenticatedActionClient
  .inputSchema(ZPromoteEmbeddedDataToSharedAction)
  .action(async ({ ctx, parsedInput }) => {
    const { id, ...input } = parsedInput;
    const workspaceId = await requireWorkspaceScope(id);

    await assertCan({ type: "user", id: ctx.user.id }, "workspace.write", {
      type: "workspace",
      id: workspaceId,
    });
    await applyRateLimit(rateLimitConfigs.actions.stateMutation, workspaceId);

    // Read before the write, and local-scoped: promote is audited as an update, and once it lands
    // the row is shared, so this is the last moment the "before" side exists to be read at all.

    const result = await runWrite(() => promoteEmbeddedDataToShared(id, workspaceId, input));

    return result;
  });
