import { redirect } from "next/navigation";
import { cache as reactCache } from "react";
import { prisma } from "@forms/database";
import { Prisma } from "@forms/database/prisma";
import { logger } from "@forms/logger";
import { ZId } from "@forms/types/common";
import {
  AuthenticationError,
  AuthorizationError,
  DatabaseError,
  ResourceNotFoundError,
} from "@forms/types/errors";
import { DEFAULT_ORGANIZATION_BILLING } from "@forms/types/organizations";
import { getTranslate } from "@/i18n/server";
import { can } from "@/lib/authorization";
import { withAuthorizationSurface } from "@/lib/authorization/context";
import { getBillingFallbackPath } from "@/lib/membership/navigation";
import { getMembershipByUserIdOrganizationId } from "@/lib/membership/service";
import { getAccessFlags } from "@/lib/membership/utils";
import { getOrganization } from "@/lib/organization/service";
import { getUser } from "@/lib/user/service";
import { validateInputs } from "@/lib/utils/validate";
import { canUserNavigateWorkspace } from "@/lib/workspace/auth";
import { getWorkspace } from "@/lib/workspace/service";
import { getSession } from "@/modules/auth/lib/session";
import { TWorkspaceAuth, TWorkspaceLayoutData } from "@/modules/workspaces/types/workspace-auth";

/**
 * Resolves a workspace and returns the caller's authorization context for it.
 *
 * This helper is self-contained: it enforces workspace-level access itself rather
 * than relying on the route layout to gate, so it is safe to reuse from any page or
 * route. Billing-role members are redirected to billing/enterprise screens; any org
 * member without a WorkspaceTeam grant (and who is not an owner/manager) is rejected
 * with an AuthorizationError instead of being silently admitted as a writer.
 *
 * Opened as the `page` authorization surface (ENG-2388). Every product page funnels through here, so
 * this wrapper attributes authoritative decisions and checks-per-request telemetry to page traffic.
 */
export const getWorkspaceAuth = reactCache(
  async (workspaceId: string): Promise<TWorkspaceAuth> =>
    withAuthorizationSurface("page", () => resolveWorkspaceAuth(workspaceId))
);

const resolveWorkspaceAuth = async (workspaceId: string): Promise<TWorkspaceAuth> => {
  const t = await getTranslate();

  const [workspace, session] = await Promise.all([getWorkspace(workspaceId), getSession()]);

  if (!workspace) {
    throw new ResourceNotFoundError(t("common.workspace"), workspaceId);
  }

  if (!session) {
    throw new AuthenticationError(t("common.not_authenticated"));
  }

  const organization = await getOrganization(workspace.organizationId);

  if (!organization) {
    throw new ResourceNotFoundError(t("common.organization"), null);
  }

  const currentUserMembership = await getMembershipByUserIdOrganizationId(session.user.id, organization.id);
  if (!currentUserMembership) {
    throw new AuthorizationError(t("common.membership_not_found"));
  }

  const { isMember, isOwner, isManager, isBilling } = getAccessFlags(currentUserMembership.role);

  // Billing-role members are scoped to billing/enterprise screens only. They must never reach
  // workspace product data (contacts PII, survey summaries/responses, dashboards). This is the
  // single choke point every product page flows through, so gating here closes all of them at
  // once and keeps this helper aligned with the central `workspace.read` contract, which also denies
  // billing. Individual pages that also guard billing inline remain correct (defense in depth).
  if (isBilling) {
    redirect(getBillingFallbackPath(organization.id));
  }

  // Enforce workspace access here instead of delegating to the route layout, so
  // getWorkspaceAuth is safe to reuse anywhere.
  const hasWorkspaceAccess = await can({ type: "user", id: session.user.id }, "workspace.read", {
    type: "workspace",
    id: workspace.id,
  });

  if (!hasWorkspaceAccess) {
    throw new AuthorizationError(t("common.not_authorized"));
  }

  // Workspace-team grants were part of the removed paid surface; every member of the
  // organization has full access to its workspaces.
  const hasReadAccess = true;
  const hasReadWriteAccess = true;
  const hasManageAccess = false;
  const isReadOnly = false;
  const canManage = isOwner || isManager;

  return {
    workspace,
    organization,
    session,
    currentUserMembership,
    isMember,
    isOwner,
    isManager,
    isBilling,
    hasReadAccess,
    hasReadWriteAccess,
    hasManageAccess,
    isReadOnly,
    canManage,
  };
};

/**
 * Lightweight layout checks for workspace routes (survey editor, onboarding).
 *
 * Opened as the `page` surface for the same reason as `getWorkspaceAuth` (ENG-2388): the navigation
 * gate below already routes through `can()` via `canUserNavigateWorkspace`, but a layout render is
 * its own async context, so it needs its own surface to be comparable.
 */
export const workspaceIdLayoutChecks = async (workspaceId: string) =>
  withAuthorizationSurface("page", () => resolveWorkspaceIdLayoutChecks(workspaceId));

const resolveWorkspaceIdLayoutChecks = async (workspaceId: string) => {
  const t = await getTranslate();
  const session = await getSession();

  if (!session?.user) {
    return { t, session: null, user: null, organization: null };
  }

  const user = await getUser(session.user.id);
  if (!user) {
    return { t, session, user: null, organization: null };
  }

  // Resolved before the access check because the navigation gate is expressed against the
  // owning organization as well as the workspace. Answering "does it exist" first also
  // matches getWorkspaceAuth above, so a missing workspace reports itself as missing here
  // too instead of as a denial.
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      organization: {
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          name: true,
          isAISmartToolsEnabled: true,
          whitelabel: true,
        },
      },
    },
  });

  if (!workspace) {
    throw new ResourceNotFoundError(t("common.workspace"), workspaceId);
  }

  // Navigation, not data: these layouts are also what a billing-role member has to pass
  // through on the way to the billing screens, so this keeps admitting that role. The
  // pages themselves gate their data on workspace.read.
  const hasAccess = await canUserNavigateWorkspace(session.user.id, {
    id: workspaceId,
    organizationId: workspace.organization.id,
  });
  if (!hasAccess) {
    throw new AuthorizationError(t("common.not_authorized"));
  }

  return { t, session, user, organization: workspace.organization };
};

/**
 * Fetches workspace with related data in a single optimized database query.
 */
export const getWorkspaceWithRelations = reactCache(async (workspaceId: string, userId: string) => {
  try {
    const data = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        name: true,
        organizationId: true,
        languages: true,
        recontactDays: true,
        linkSurveyBranding: true,
        inAppSurveyBranding: true,
        config: true,
        placement: true,
        clickOutsideClose: true,
        overlay: true,
        overlayColor: true,
        overlayOpacity: true,
        appSetupCompleted: true,
        styling: true,
        logo: true,
        customHeadScripts: true,
        organization: {
          select: {
            id: true,
            createdAt: true,
            updatedAt: true,
            name: true,
            isAISmartToolsEnabled: true,
            whitelabel: true,
            displayTimeZone: true,
            memberships: {
              where: { userId },
              select: {
                userId: true,
                organizationId: true,
                accepted: true,
                role: true,
              },
              take: 1,
            },
          },
        },
      },
    });

    if (!data) return null;

    return {
      workspace: {
        id: data.id,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        name: data.name,
        organizationId: data.organizationId,
        languages: data.languages,
        recontactDays: data.recontactDays,
        linkSurveyBranding: data.linkSurveyBranding,
        inAppSurveyBranding: data.inAppSurveyBranding,
        config: data.config,
        placement: data.placement,
        clickOutsideClose: data.clickOutsideClose,
        overlay: data.overlay,
        overlayColor: data.overlayColor,
        overlayOpacity: data.overlayOpacity,
        styling: data.styling,
        logo: data.logo,
        customHeadScripts: data.customHeadScripts,
        appSetupCompleted: data.appSetupCompleted,
      },
      organization: {
        id: data.organization.id,
        createdAt: data.organization.createdAt,
        updatedAt: data.organization.updatedAt,
        name: data.organization.name,
        billing: DEFAULT_ORGANIZATION_BILLING,
        isAISmartToolsEnabled: data.organization.isAISmartToolsEnabled,
        whitelabel: data.organization.whitelabel,
        displayTimeZone: data.organization.displayTimeZone,
      },
      membership: data.organization.memberships[0] || null,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      logger.error(error, "Error getting workspace with relations");
      throw new DatabaseError(error.message);
    }
    throw error;
  }
});

/**
 * Fetches all data required for workspace layout rendering.
 * Resolves the production environment automatically.
 *
 * Opened as the `page` surface for the same reason as its two siblings above (ENG-2388). This one
 * backs the top-level `/workspaces/[workspaceId]` layout, so it is the highest-traffic authorization
 * gate of the three — its `canUserNavigateWorkspace` call reaches `can()` on essentially every
 * product navigation. The surface keeps authoritative decision and request-amplification telemetry
 * attributable without participating in engine selection.
 */
export const getWorkspaceLayoutData = reactCache(
  async (workspaceId: string, userId: string): Promise<TWorkspaceLayoutData> =>
    withAuthorizationSurface("page", () => resolveWorkspaceLayoutData(workspaceId, userId))
);

const resolveWorkspaceLayoutData = async (
  workspaceId: string,
  userId: string
): Promise<TWorkspaceLayoutData> => {
  validateInputs([workspaceId, ZId]);
  validateInputs([userId, ZId]);

  const t = await getTranslate();
  const session = await getSession();

  if (!session?.user) {
    throw new AuthenticationError(t("common.not_authenticated"));
  }

  if (session.user.id !== userId) {
    throw new AuthenticationError("User ID mismatch with session");
  }

  const user = await getUser(userId);
  if (!user) {
    throw new AuthenticationError(t("common.not_authenticated"));
  }

  // Resolved first so the navigation gate below can name the owning organization. This is
  // the same request-memoized read the rest of this function already relied on, so it costs
  // nothing extra; it only moves.
  const relationData = await getWorkspaceWithRelations(workspaceId, userId);
  if (!relationData) {
    throw new ResourceNotFoundError(t("common.workspace"), workspaceId);
  }

  const { workspace, organization, membership } = relationData;

  // Navigation, not data — the layout shell a billing-role member passes through on the way
  // to billing. Product data on the pages inside stays gated on workspace.read.
  const hasAccess = await canUserNavigateWorkspace(userId, {
    id: workspace.id,
    organizationId: organization.id,
  });
  if (!hasAccess) {
    throw new AuthorizationError(t("common.not_authorized"));
  }

  if (!membership) {
    throw new AuthorizationError(t("common.membership_not_found"));
  }

  return {
    session,
    user,
    workspace,
    organization,
    membership,
  };
};
