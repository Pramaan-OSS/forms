import { expect } from "@playwright/test";
import { test } from "./lib/fixtures";

test("sign-out completes before navigating and protected pages stay signed out", async ({ page, users }) => {
  const user = await users.create();
  await user.login();
  await page.waitForURL(/\/workspaces\/[^/]+\/surveys/);
  await page.route("**/api/auth/sign-out", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 750));
    await route.continue();
  });
  const signedOut = page.waitForResponse((response) => response.url().endsWith("/api/auth/sign-out"));
  await page.locator("#userDropdownTrigger").click();
  await page.getByRole("menuitem", { name: "Log out", exact: true }).click();
  expect((await signedOut).status()).toBe(200);
  await page.waitForURL(/\/auth\/login/);
  const cookies = await page.context().cookies();
  expect(cookies.filter((cookie) => /^(__Secure-)?forms\.session_(token|data)$/.test(cookie.name))).toEqual(
    []
  );
  await page.goto(`/workspaces/${user.workspaceId}/surveys`);
  await expect(page).toHaveURL(/\/auth\/login/);
});
