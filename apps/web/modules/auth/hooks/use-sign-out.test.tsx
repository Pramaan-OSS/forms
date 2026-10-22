import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useSignOut } from "@/modules/auth/hooks/use-sign-out";

// vitestSetup.ts mocks this hook globally (so component tests don't hit Better Auth); unmock here so
// we exercise the REAL implementation.
vi.unmock("@/modules/auth/hooks/use-sign-out");

// Hoisted so the (hoisted) vi.mock factories below can reference them.
const { baSignOut } = vi.hoisted(() => ({ baSignOut: vi.fn() }));
vi.mock("@/modules/auth/lib/auth-client", () => ({
  authClient: { signOut: (...args: unknown[]) => baSignOut(...args) },
}));

const flushTransition = async () => {
  // React transitions settle on a microtask; a short yield is enough in tests.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

describe("useSignOut", () => {
  let originalLocation: Location;

  beforeEach(() => {
    vi.clearAllMocks();
    originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, href: "http://localhost/" },
    });
    baSignOut.mockResolvedValue(undefined);
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  test("signs out through Better Auth and navigates to the login screen", async () => {
    const { result } = renderHook(() => useSignOut());

    result.current.signOut();
    await flushTransition();

    expect(baSignOut).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe("/auth/login");
  });

  test("still navigates away when the Better Auth call fails", async () => {
    baSignOut.mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useSignOut());

    result.current.signOut();
    await flushTransition();

    expect(window.location.href).toBe("/auth/login");
  });
});
