"use client";

import { useEffect } from "react";
import { useSignOut } from "@/modules/auth/hooks/use-sign-out";

export const ClientLogout = () => {
  const { signOut: signOutWithAudit } = useSignOut();

  useEffect(() => {
    signOutWithAudit();
  });
  return null;
};
