import { expect } from "@playwright/test";
import { prisma } from "@forms/database";
import type { UsersFixture } from "./fixtures/users";
import { test } from "./lib/fixtures";

// A saved billing membership must not grant access to survey data. The removed
// billing screens now fall back to the organization's general settings.

// Creates an organization (owned by `owner`) with a workspace holding product data, plus a second
// user who is a billing-role member of that same organization.
const setupOrgWithBillingMember = async (users: UsersFixture) => {
  const owner = await users.create();
  if (!owner.organizationId || !owner.workspaceId) {
    throw new Error("Owner org/workspace not seeded for test");
  }

  const billingUser = await users.create({ withoutWorkspace: true });
  await prisma.membership.create({
    data: {
      userId: billingUser.id,
      organizationId: owner.organizationId,
      role: "billing",
      accepted: true,
    },
  });

  // users.create seeds a survey in the workspace; it backs the survey summary/responses URLs below.
  const survey = await prisma.survey.findFirstOrThrow({
    where: { workspaceId: owner.workspaceId },
    select: { id: true },
  });

  const workspaceBase = `/workspaces/${owner.workspaceId}`;
  return {
    owner,
    billingUser,
    workspaceId: owner.workspaceId,
    surveysUrl: `${workspaceBase}/surveys`,
    // Every workspace product surface flows through getWorkspaceAuth, so all of them must redirect.
    productUrls: [
      `${workspaceBase}/surveys`,
      `${workspaceBase}/settings/workspace/general`,
      `${workspaceBase}/surveys/${survey.id}/summary`,
      `${workspaceBase}/surveys/${survey.id}/responses`,
    ],
  };
};

test.describe("Billing-role workspace access (ENG-1763)", () => {
  const billingHomeUrl = /\/organizations\/[^/]+\/settings\/general/;

  test("redirects a saved billing membership to organization settings", async ({ page, users }) => {
    const { billingUser, productUrls } = await setupOrgWithBillingMember(users);

    await billingUser.login();

    for (const url of productUrls) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await expect(page, `billing member should be redirected off ${url}`).toHaveURL(billingHomeUrl);
    }
  });

  test("keeps product-page access for a non-billing owner", async ({ page, users }) => {
    const { owner, workspaceId, surveysUrl } = await setupOrgWithBillingMember(users);

    await owner.login();
    await page.goto(surveysUrl, { waitUntil: "domcontentloaded" });

    // The owner reaches the survey list rather than an error page or a fallback.
    await expect(page).toHaveURL(new RegExp(`/workspaces/${workspaceId}/surveys`));
    await expect(page.getByRole("heading", { name: "Surveys", exact: true })).toBeVisible();
  });
});
