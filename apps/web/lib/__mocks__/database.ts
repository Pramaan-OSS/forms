import { beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import { PrismaClient } from "@forms/database/prisma";

export const prisma = mockDeep<PrismaClient>();

vi.mock("@forms/database", () => ({
  __esModule: true,
  prisma,
}));

beforeEach(() => {
  mockReset(prisma);
});
