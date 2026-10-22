"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "@/app/(app)/workspaces/[workspaceId]/context/workspace-context";
import {
  getAIUnavailableAction,
  getAIUnavailableActionLabel,
  getAIUnavailableMessage,
} from "@/lib/ai/availability";
import type { TAIUnavailableReason } from "@/lib/ai/service";
import { Alert, AlertButton, AlertDescription, AlertTitle } from "@/modules/ui/components/alert";

interface AIUnavailableAlertProps {
  /** Names the blocked capability, e.g. "AI chart generation". The reason copy is shared. */
  title: string;
  reason?: TAIUnavailableReason;
  /** Distinguishes the surface that showed the unavailable notice. */
  feature: string;
}

/**
 * The one way to say "AI smart tools are unavailable here". Every surface that gates on AI shows this
 * same alert, so the reason copy and the action behind it are resolved once (`lib/ai/availability`)
 * instead of per feature.
 */
export const AIUnavailableAlert = ({ title, reason }: Readonly<AIUnavailableAlertProps>) => {
  const { t } = useTranslation();
  const { workspace } = useWorkspace();

  const action = workspace?.organizationId
    ? getAIUnavailableAction(reason, workspace.organizationId)
    : undefined;

  return (
    <Alert variant="info" role="status">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{getAIUnavailableMessage(reason, t)}</AlertDescription>
      {action && (
        <AlertButton asChild>
          <Link
            href={action.href}
            {...(action.isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            {getAIUnavailableActionLabel(action.type, t)}
          </Link>
        </AlertButton>
      )}
    </Alert>
  );
};
