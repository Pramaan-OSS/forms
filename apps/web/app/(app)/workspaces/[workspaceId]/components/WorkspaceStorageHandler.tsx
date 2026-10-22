"use client";

import { useEffect } from "react";
import { FORMS_ENVIRONMENT_ID_LS, FORMS_WORKSPACE_ID_LS } from "@/lib/localStorage";

interface WorkspaceStorageHandlerProps {
  workspaceId: string;
}

const WorkspaceStorageHandler = ({ workspaceId }: WorkspaceStorageHandlerProps) => {
  useEffect(() => {
    localStorage.setItem(FORMS_WORKSPACE_ID_LS, workspaceId);
    // Keep legacy environment ID in sync for backward compatibility with old SDK clients
    localStorage.setItem(FORMS_ENVIRONMENT_ID_LS, workspaceId);
  }, [workspaceId]);

  return null;
};

export default WorkspaceStorageHandler;
