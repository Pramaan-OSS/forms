import { beforeEach, describe, expect, test, vi } from "vitest";
import { hashPassword, verifyPassword } from "./utils";

const PASSWORD_HASH_TEST_TIMEOUT_MS = 45_000;

describe("password hashing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test(
    "hashes and verifies a password end-to-end",
    async () => {
      const password = "correct-horse-battery-staple";
      const hash = await hashPassword(password);
      expect(hash).not.toBe(password);
      await expect(verifyPassword(password, hash)).resolves.toBe(true);
      await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
    },
    PASSWORD_HASH_TEST_TIMEOUT_MS
  );
});
