import { expect } from "playwright/test";
import { prisma } from "@forms/database";
import { test } from "./lib/fixtures";
import { invites } from "./utils/mock";

test.describe("Invite, accept and remove organization member", async () => {
  test.beforeEach(async ({ page, users }) => {
    const user = await users.create();
    await user.login();

    await page.waitForURL(/\/workspaces\/[^/]+\/surveys/);
  });

  test("Invite organization member", async ({ page }) => {
    const inviteEmail = `org-invite-${Date.now()}@forms.com`;

    await test.step("Invite User", async () => {
      const workspaceId = /\/workspaces\/([^/]+)\//.exec(page.url())?.[1];
      // Old workspace-scoped org settings URL is redirected to the org-scoped route.
      await page.goto(`/workspaces/${workspaceId}/settings/organization/teams`);
      await page.waitForURL(/\/organizations\/[^/]+\/settings\/teams/);

      await page.locator('[data-testid="members-loading-card"]:first-child').waitFor({ state: "hidden" });

      // Add member button
      await expect(page.getByRole("button", { name: "Invite member" })).toBeVisible();
      await page.getByRole("button", { name: "Invite member" }).click();

      // Fill the member name and email form
      await expect(page.getByLabel("Email")).toBeVisible();
      await page.getByLabel("Full Name").fill(invites.addMember.name);

      await expect(page.getByLabel("Email")).toBeVisible();
      await page.getByLabel("Email").fill(inviteEmail);

      await page.getByRole("button", { name: "Invite", exact: true }).click();

      await expect(page.locator(".forms__toast__success")).toBeVisible({ timeout: 15000 });
    });

    await test.step("Copy invite Link", async () => {
      await expect(page.locator("#membersInfoWrapper")).toBeVisible();

      const invitedMemberInfo = page.locator("#singleMemberInfo").filter({ hasText: inviteEmail });
      await expect(invitedMemberInfo).toBeVisible({ timeout: 10000 });

      await expect(invitedMemberInfo.getByText("Pending", { exact: true })).toBeVisible();

      const shareInviteButton = invitedMemberInfo.locator("#shareInviteButton");
      await expect(shareInviteButton).toBeVisible();

      await shareInviteButton.click();

      const inviteLinkText = await page.waitForSelector("#inviteLinkText");
      expect(inviteLinkText).toBeTruthy();

      // invite link text is an input element, so we need to get its value instead of textContent
      const inviteLinkTextContent = await inviteLinkText.inputValue();
      expect(inviteLinkTextContent).toBeTruthy();
    });

    await test.step("Revoke the pending invitation", async () => {
      await page.keyboard.press("Escape");
      const row = page.locator("#singleMemberInfo").filter({ hasText: inviteEmail });
      await row.locator("#deleteMemberButton").click();
      await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
      await expect(row).toHaveCount(0);
      expect(await prisma.invite.count({ where: { email: inviteEmail } })).toBe(0);
    });
  });
});

test("removes an accepted member without deleting their account", async ({ page, users }) => {
  const owner = await users.create();
  const email = `member-removal-${Date.now()}@example.com`;
  const member = await users.create({ email, withoutWorkspace: true });
  await prisma.membership.create({
    data: { userId: member.id, organizationId: owner.organizationId!, role: "member", accepted: true },
  });
  await owner.login();
  await page.goto(`/organizations/${owner.organizationId}/settings/teams`);
  const row = page.locator("#singleMemberInfo").filter({ hasText: email });
  await expect(row).toBeVisible();
  await row.locator("#deleteMemberButton").click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row).toHaveCount(0);
  expect(
    await prisma.membership.count({ where: { userId: member.id, organizationId: owner.organizationId } })
  ).toBe(0);
  expect(await prisma.user.count({ where: { id: member.id } })).toBe(1);
});
