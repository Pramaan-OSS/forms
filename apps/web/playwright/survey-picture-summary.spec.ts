import { expect } from "@playwright/test";
import { prisma } from "@forms/database";
import { test } from "./lib/fixtures";

test("picture summary copy and filtering use separate buttons", async ({ page, users }) => {
  const owner = await users.create();
  const choiceId = "picture-choice";
  const survey = await prisma.survey.create({
    data: {
      workspaceId: owner.workspaceId!,
      createdBy: owner.id,
      name: "Picture summary",
      type: "link",
      status: "inProgress",
      blocks: [
        {
          id: "picture-block",
          name: "Picture",
          elements: [
            {
              id: "picture-question",
              type: "pictureSelection",
              required: true,
              headline: { default: "Choose a picture" },
              choices: [
                { id: choiceId, imageUrl: "/image-backgrounds/plant.webp", alt: "Plant" },
                {
                  id: "second-choice",
                  imageUrl: "/image-backgrounds/flowers.webp",
                  alt: "Flowers",
                },
              ],
            },
          ],
        },
      ],
    },
  });
  await prisma.response.create({
    data: { surveyId: survey.id, finished: true, data: { "picture-question": [choiceId] } },
  });
  await prisma.response.create({
    data: { surveyId: survey.id, finished: true, data: { "picture-question": ["second-choice"] } },
  });
  await owner.login();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(`/workspaces/${owner.workspaceId}/surveys/${survey.id}/summary`);
  const copy = page.getByRole("button", { name: `Copy ${choiceId}`, exact: true });
  await expect(copy).toBeVisible();
  await expect(page.locator("button button")).toHaveCount(0);
  const completed = page.getByRole("button", { name: /^Completed / });
  await expect(completed).toContainText("2");
  await copy.click();
  await expect
    .poll(() =>
      page
        .getByRole("img", { name: "Picture 1", exact: true })
        .evaluate((image: HTMLImageElement) => image.naturalWidth)
    )
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(choiceId);
  await page.getByRole("button", { name: "Picture 1", exact: true }).click();
  await expect(page.getByRole("button", { name: "Filter (1)", exact: true })).toBeVisible();
  await expect(completed).toContainText("1");
  expect(
    errors.filter((message) => /cannot.*(descendant|nested|contain).*button|hydration/i.test(message))
  ).toEqual([]);
});
