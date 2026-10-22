"use client";

import { useTransition } from "react";
import { authClient } from "@/modules/auth/lib/auth-client";

/**
 * Signs the user out and navigates to the login screen.
 *
 * Better Auth sign-out clears the BA session; the redirect is manual (BA's signOut doesn't take
 * a callback on all surfaces). We ALWAYS navigate away even if the BA /sign-out call fails
 * (best-effort), so a broken session can never trap the user on an authenticated page.
 */
export const useSignOut = () => {
  const [isPending, startTransition] = useTransition();

  const signOut = async () => {
    startTransition(() => {
      void (async () => {
        try {
          await authClient.signOut();
        } catch {
          // best-effort: fall through to the redirect
        }
        window.location.href = "/auth/login";
      })();
    });
  };

  return { signOut, isPending };
};
