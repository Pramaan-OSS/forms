import "server-only";
import { cache as reactCache } from "react";
import { prisma } from "@forms/database";
import { Prisma } from "@forms/database/prisma";
import { PrismaErrorType } from "@forms/database/types/error";
import { logger } from "@forms/logger";
import { ZId, ZOptionalNumber, ZString } from "@forms/types/common";
import { DatabaseError, ResourceNotFoundError } from "@forms/types/errors";
import {
  DEFAULT_ORGANIZATION_BILLING,
  TOrganization,
  TOrganizationCreateInput,
  TOrganizationUpdateInput,
  ZOrganizationCreateInput,
} from "@forms/types/organizations";
import { TUserNotificationSettings } from "@forms/types/user";
import { lookupAuthorizedOrganizationIds } from "@/lib/authorization/resource-list";
import { reconcileApiKeyRelationships } from "@/lib/authzed/api-key";
import { deleteOrganizationRelationships } from "@/lib/authzed/organization-membership";
import { runPostCommitProjection } from "@/lib/authzed/projection-boundary";
import { reconcileTeamWorkspaceRelationships } from "@/lib/authzed/team-workspace";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { updateUser } from "@/lib/user/service";
import { getBillingUsageCycleWindow } from "@/lib/utils/billing";
import { getWorkspaces } from "@/lib/workspace/service";
import { countOrganizationResponses } from "@/modules/organization/usage/lib/response-count";
import { deleteWorkspaceFilesBestEffort } from "@/modules/storage/service";
import { validateInputs } from "../utils/validate";

export const select = {
  id: true,
  createdAt: true,
  updatedAt: true,
  name: true,
  isAISmartToolsEnabled: true,
  whitelabel: true,
  displayTimeZone: true,
} satisfies Prisma.OrganizationSelect;

type TOrganizationRow = Prisma.OrganizationGetPayload<{ select: typeof select }>;

const mapOrganization = (organization: TOrganizationRow): TOrganization => ({
  id: organization.id,
  createdAt: organization.createdAt,
  updatedAt: organization.updatedAt,
  name: organization.name,
  billing: DEFAULT_ORGANIZATION_BILLING,
  isAISmartToolsEnabled: organization.isAISmartToolsEnabled,
  whitelabel: organization.whitelabel as TOrganization["whitelabel"],
  displayTimeZone: organization.displayTimeZone,
});

export const getOrganizationsTag = (organizationId: string) => `organizations-${organizationId}`;
export const getOrganizationsByUserIdCacheTag = (userId: string) => `users-${userId}-organizations`;

export const getOrganizationsByUserId = reactCache(
  async (userId: string, page?: number): Promise<TOrganization[]> => {
    validateInputs([userId, ZString], [page, ZOptionalNumber]);

    try {
      const organizationIds = await lookupAuthorizedOrganizationIds({ type: "user", id: userId });
      if (organizationIds.length === 0) return [];

      const organizations = await prisma.organization.findMany({
        where: {
          id: { in: [...organizationIds] },
        },
        select,
        take: page ? ITEMS_PER_PAGE : undefined,
        skip: page ? ITEMS_PER_PAGE * (page - 1) : undefined,
      });
      if (!organizations) {
        throw new ResourceNotFoundError("Organizations by UserId", userId);
      }
      return organizations.map(mapOrganization);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw new DatabaseError(error.message);
      }

      throw error;
    }
  }
);

export const getOrganizationByWorkspaceId = reactCache(
  async (workspaceId: string): Promise<TOrganization | null> => {
    validateInputs([workspaceId, ZId]);

    try {
      const organization = await prisma.organization.findFirst({
        where: {
          workspaces: {
            some: {
              id: workspaceId,
            },
          },
        },
        select: { ...select, memberships: true },
      });

      return organization ? mapOrganization(organization) : null;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        logger.error(error, "Error getting organization by workspace id");
        throw new DatabaseError(error.message);
      }

      throw error;
    }
  }
);

export const getOrganization = reactCache(async (organizationId: string): Promise<TOrganization | null> => {
  validateInputs([organizationId, ZString]);

  try {
    const organization = await prisma.organization.findUnique({
      where: {
        id: organizationId,
      },
      select,
    });
    return organization ? mapOrganization(organization) : null;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new DatabaseError(error.message);
    }

    throw error;
  }
});

export const createOrganization = async (
  organizationInput: TOrganizationCreateInput
): Promise<TOrganization> => {
  try {
    validateInputs([organizationInput, ZOrganizationCreateInput]);

    const organization = await prisma.organization.create({
      data: {
        ...organizationInput,
      },
      select,
    });

    return mapOrganization(organization);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new DatabaseError(error.message);
    }

    throw error;
  }
};

export const updateOrganization = async (
  organizationId: string,
  data: Partial<TOrganizationUpdateInput>
): Promise<TOrganization> => {
  try {
    // `billing` used to be a writable part of the payload; paid tiers are gone, so it is ignored.
    const { billing: _billing, ...organizationData } = data;

    const updatedOrganization = await prisma.$transaction(async (tx) => {
      const existingOrganization = await tx.organization.findUnique({
        where: {
          id: organizationId,
        },
        select: {
          id: true,
        },
      });

      if (!existingOrganization) {
        throw new ResourceNotFoundError("Organization", organizationId);
      }

      if (Object.keys(organizationData).length > 0) {
        await tx.organization.update({
          where: {
            id: organizationId,
          },
          data: organizationData,
        });
      }

      return tx.organization.findUnique({
        where: {
          id: organizationId,
        },
        select: { ...select, memberships: true, workspaces: { select: { id: true } } }, // include memberships & workspaces
      });
    });

    if (!updatedOrganization) {
      throw new ResourceNotFoundError("Organization", organizationId);
    }

    const organization = {
      ...mapOrganization(updatedOrganization),
      memberships: undefined,
      workspaces: undefined,
    };

    return organization;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === PrismaErrorType.RecordNotFound
    ) {
      throw new ResourceNotFoundError("Organization", organizationId);
    }
    throw error; // Re-throw any other errors
  }
};

export const deleteOrganization = async (organizationId: string) => {
  validateInputs([organizationId, ZId]);
  try {
    const deletedOrganization = await prisma.organization.delete({
      where: {
        id: organizationId,
      },
      select: {
        id: true,
        name: true,
        memberships: {
          select: {
            userId: true,
          },
        },
        // legacyEnvironmentId is selected off the *deleted* rows so both storage prefixes are
        // captured atomically, before the cascade takes the workspace rows with it. Reading them
        // back afterwards is not possible, which is why getWorkspaceLegacyStoragePrefixes cannot
        // be used here.
        workspaces: {
          select: {
            id: true,
            legacyEnvironmentId: true,
          },
        },
        teams: {
          select: {
            id: true,
          },
        },
        apiKeys: {
          select: {
            id: true,
          },
        },
        feedbackDirectories: {
          select: {
            id: true,
            workspaces: { select: { workspaceId: true } },
          },
        },
      },
    });

    await runPostCommitProjection("organization_delete_relationship_cleanup", () =>
      deleteOrganizationRelationships(organizationId)
    );
    await runPostCommitProjection("organization_delete_team_workspace_cleanup", () =>
      reconcileTeamWorkspaceRelationships({
        teamIds: deletedOrganization.teams.map(({ id }) => id),
        workspaceIds: deletedOrganization.workspaces.map(({ id }) => id),
      })
    );
    await runPostCommitProjection("organization_delete_api_key_cleanup", () =>
      reconcileApiKeyRelationships({
        apiKeyIds: deletedOrganization.apiKeys.map(({ id }) => id),
      })
    );
    // Best-effort: remove each workspace's uploaded files (survey media, logos, response
    // attachments). The cascade has already dropped every row that referenced them, so leaving
    // them behind orphans respondent data in the bucket with nothing left to enumerate it by.
    for (const workspace of deletedOrganization.workspaces) {
      await deleteWorkspaceFilesBestEffort(workspace);
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new DatabaseError(error.message);
    }

    throw error;
  }
};

export const getMonthlyOrganizationResponseCount = reactCache(
  async (organizationId: string): Promise<number> => {
    validateInputs([organizationId, ZId]);

    try {
      const organization = await getOrganization(organizationId);
      if (!organization) {
        throw new ResourceNotFoundError("Organization", organizationId);
      }

      const usageCycleWindow = getBillingUsageCycleWindow(organization.billing);

      return await countOrganizationResponses(organizationId, {
        gte: usageCycleWindow.start,
        lt: usageCycleWindow.end,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw new DatabaseError(error.message);
      }

      throw error;
    }
  }
);

export const getMonthlyOrganizationWorkflowRunCount = reactCache(
  async (organizationId: string): Promise<number> => {
    validateInputs([organizationId, ZId]);

    try {
      const organization = await getOrganization(organizationId);
      if (!organization) {
        throw new ResourceNotFoundError("Organization", organizationId);
      }

      const usageCycleWindow = getBillingUsageCycleWindow(organization.billing);

      const workspaces = await getWorkspaces(organizationId);
      const workspaceIds = workspaces.map((workspace) => workspace.id);

      // Mirror the metered usage: count only non-dry runs in the current billing cycle, scoped to the
      // organization's workspaces. Dry runs are excluded from billing, so they must not show as usage.
      const workflowRunAggregations = await prisma.workflowRun.aggregate({
        _count: {
          id: true,
        },
        where: {
          AND: [
            { workspaceId: { in: workspaceIds } },
            { isDryRun: false },
            { createdAt: { gte: usageCycleWindow.start, lt: usageCycleWindow.end } },
          ],
        },
      });

      return workflowRunAggregations._count.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw new DatabaseError(error.message);
      }

      throw error;
    }
  }
);

export const subscribeOrganizationMembersToSurveyResponses = async (
  surveyId: string,
  createdBy: string,
  organizationId: string
): Promise<void> => {
  const surveyCreator = await prisma.user.findUnique({
    where: {
      id: createdBy,
    },
  });

  if (!surveyCreator) {
    throw new ResourceNotFoundError("User", createdBy);
  }

  if (surveyCreator.notificationSettings?.unsubscribedOrganizationIds?.includes(organizationId)) {
    return;
  }

  const defaultSettings = { alert: {} as NonNullable<TUserNotificationSettings["alert"]> };
  const updatedNotificationSettings: TUserNotificationSettings = {
    ...defaultSettings,
    ...surveyCreator.notificationSettings,
    alert: surveyCreator.notificationSettings?.alert
      ? { ...surveyCreator.notificationSettings.alert }
      : defaultSettings.alert,
  };

  updatedNotificationSettings.alert[surveyId] = true;

  await updateUser(surveyCreator.id, {
    notificationSettings: updatedNotificationSettings,
  });
};

export const getOrganizationsWhereUserIsSingleOwner = reactCache(
  async (userId: string): Promise<TOrganization[]> => {
    validateInputs([userId, ZString]);
    try {
      const orgs = await prisma.organization.findMany({
        where: {
          memberships: {
            some: {
              userId,
              role: "owner",
            },
          },
        },
        select: {
          ...select,
          memberships: {
            where: {
              role: "owner",
            },
          },
        },
      });

      // Filter to only include orgs where there is exactly one owner
      const filteredOrgs = orgs
        .filter((org) => org.memberships.length === 1)
        .map((org) => ({
          ...mapOrganization(org),
          memberships: undefined, // Remove memberships from the return object to match TOrganization type
        }));

      return filteredOrgs;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw new DatabaseError(error.message);
      }
      throw error;
    }
  }
);
