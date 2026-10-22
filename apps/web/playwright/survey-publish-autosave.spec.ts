import { expect } from "@playwright/test";
import { test } from "./lib/fixtures";
import { createSurveyFromScratch } from "./utils/helper";

test("publishing keeps draft autosave stopped during a slow summary navigation", async ({ page, users }) => {
  test.setTimeout(180000);
  const user = await users.create();
  await user.login();
  await page.waitForURL(/\/workspaces\/[^/]+\/surveys/);
  await createSurveyFromScratch(page);

  const editPath = new URL(page.url()).pathname;
  let editPosts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === editPath) editPosts++;
  });
  // Keep the editor mounted beyond its ten-second autosave interval after publishing.
  await page.route("**/surveys/*/summary**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 14000));
    await route.continue();
  });
  let publishReturned = false;
  const published = page
    .waitForResponse(
      (response) => response.request().method() === "POST" && new URL(response.url()).pathname === editPath
    )
    .then((response) => {
      publishReturned = true;
      return response;
    });
  await page.getByRole("button", { name: "Activate", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Who can view this survey in your workspace?" });
  await expect.poll(async () => publishReturned || (await dialog.isVisible())).toBe(true);
  if (await dialog.isVisible()) {
    await dialog.getByRole("radio", { name: /^Visible to / }).check();
    await dialog.getByRole("button", { name: "Activate", exact: true }).click();
  }
  expect((await published).ok()).toBe(true);
  const postsAtPublish = editPosts;
  await page.waitForTimeout(11000);
  expect(editPosts).toBe(postsAtPublish);
  await page.waitForURL(/\/summary/);
  await page.waitForLoadState("networkidle");
});

test("renaming a fresh survey keeps the sharing button in place when the title loses focus", async ({
  page,
  users,
}) => {
  const user = await users.create();
  await user.login();
  await page.waitForURL(/\/workspaces\/[^/]+\/surveys/);
  await createSurveyFromScratch(page);
  await page.getByRole("textbox", { name: "Survey name", exact: true }).fill("Preview focus regression");
  const sharingButton = page.getByRole("button", { name: "Collaborate", exact: true, includeHidden: true });
  const positionBeforeBlur = (await sharingButton.boundingBox())?.x;
  await sharingButton.click();
  expect((await sharingButton.boundingBox())?.x).toBe(positionBeforeBlur);
  const dialog = page.getByRole("dialog", { name: "Collaborate", exact: true });
  await expect(dialog).toBeVisible();
  // Exercise the editor's 300ms preview debounce while this dialog owns focus.
  await page.waitForTimeout(700);
  await dialog.getByLabel("Visibility").click();
  await page.getByRole("option", { name: /^Visible to / }).click();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toBeHidden();
});
