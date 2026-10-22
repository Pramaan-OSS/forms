"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Session } from "@forms/types/auth";
import { TOrganization } from "@forms/types/organizations";
import { TUser } from "@forms/types/user";
import { DeleteAccountModal } from "@/modules/account/components/DeleteAccountModal";
import { Button } from "@/modules/ui/components/button";
import { TooltipRenderer } from "@/modules/ui/components/tooltip";

interface DeleteAccountProps {
  session: Session | null;
  user: TUser;
  organizationsWithSingleOwner: TOrganization[];
  isMultiOrgEnabled: boolean;
  requiresPasswordConfirmation: boolean;
}

export const DeleteAccount = ({
  session,
  user,
  organizationsWithSingleOwner,
  isMultiOrgEnabled,
  requiresPasswordConfirmation,
}: Readonly<DeleteAccountProps>) => {
  const [isModalOpen, setModalOpen] = useState(false);
  const isDeleteDisabled = !isMultiOrgEnabled && organizationsWithSingleOwner.length > 0;
  const { t } = useTranslation();

  if (!session) {
    return null;
  }

  return (
    <div>
      <DeleteAccountModal
        requiresPasswordConfirmation={requiresPasswordConfirmation}
        open={isModalOpen}
        setOpen={setModalOpen}
        user={user}
        organizationsWithSingleOwner={organizationsWithSingleOwner}
      />
      <p className="text-sm text-slate-700">
        <strong>{t("workspace.settings.profile.warning_cannot_undo")}</strong>
      </p>
      <TooltipRenderer
        shouldRender={isDeleteDisabled}
        tooltipContent={t("workspace.settings.profile.warning_cannot_delete_account")}>
        <Button
          className="mt-4"
          variant="destructive"
          size="sm"
          onClick={() => setModalOpen(!isModalOpen)}
          disabled={isDeleteDisabled}>
          {t("workspace.settings.profile.confirm_delete_my_account")}
        </Button>
      </TooltipRenderer>
    </div>
  );
};
