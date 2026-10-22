"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { getFormattedErrorMessage } from "@/lib/utils/error-message";
import { Label } from "@/modules/ui/components/label";
import { Switch } from "@/modules/ui/components/switch";
import { updateWorkspaceAction } from "../../actions";

interface EditBrandingProps {
  type: "linkSurvey" | "appSurvey";
  isEnabled: boolean;
  workspaceId: string;
  isReadOnly?: boolean;
}

export const EditBranding = ({ type, isEnabled, workspaceId, isReadOnly }: EditBrandingProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const [isBrandingEnabled, setIsBrandingEnabled] = useState(isEnabled);
  const [updatingBranding, setUpdatingBranding] = useState(false);

  const toggleBranding = async () => {
    setUpdatingBranding(true);
    const newBrandingState = !isBrandingEnabled;
    setIsBrandingEnabled(newBrandingState);

    const updateBrandingResponse = await updateWorkspaceAction({
      workspaceId,
      data: {
        [type === "linkSurvey" ? "linkSurveyBranding" : "inAppSurveyBranding"]: newBrandingState,
      },
    });

    if (updateBrandingResponse?.data) {
      toast.success(
        newBrandingState
          ? t("workspace.look.forms_branding_shown")
          : t("workspace.look.forms_branding_hidden")
      );
      router.refresh();
    } else {
      const errorMessage = getFormattedErrorMessage(updateBrandingResponse);
      toast.error(errorMessage);
    }
    setUpdatingBranding(false);
  };

  return (
    <div className="flex items-center gap-x-2">
      <Switch
        id={`branding-${type}`}
        checked={isBrandingEnabled}
        onCheckedChange={toggleBranding}
        disabled={updatingBranding || isReadOnly}
      />
      <Label htmlFor={`branding-${type}`}>
        {t("workspace.look.show_forms_branding_in", {
          type: type === "linkSurvey" ? t("common.link") : t("common.app"),
        })}
      </Label>
    </div>
  );
};
