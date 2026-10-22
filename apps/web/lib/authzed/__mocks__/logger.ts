import { vi } from "vitest";

export const loggerMocks = {
  debug: vi.fn(),
  warn: vi.fn(),
};

vi.mock("@forms/logger", () => ({
  logger: loggerMocks,
}));
