import { test as base } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { createUsersFixture } from "../fixtures/users";

export interface Fixtures {
  users: ReturnType<typeof createUsersFixture>;
}

export const test = base.extend<Fixtures>({
  page: async ({ page }, use) => {
    const address = randomBytes(2);
    await page.context().setExtraHTTPHeaders({
      "x-forwarded-for": `198.18.${address[0]}.${address[1]}`,
    });
    await use(page);
  },
  users: async ({ page }, use, workerInfo) => {
    const usersFixture = createUsersFixture(page, workerInfo);
    await use(usersFixture);
  },
});
