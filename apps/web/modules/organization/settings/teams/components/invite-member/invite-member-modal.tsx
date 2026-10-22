"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TOrganizationRole } from "@forms/types/memberships";
import { TInvitee } from "@/modules/organization/settings/teams/types/invites";
import { TOrganizationTeam } from "@/modules/organization/settings/teams/types/team";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/modules/ui/components/dialog";
import { TabToggle } from "@/modules/ui/components/tab-toggle";
import { getTeamsByOrganizationIdAction } from "@/modules/workspaces/settings/actions";
import { BulkInviteTab } from "./bulk-invite-tab";
import { IndividualInviteTab } from "./individual-invite-tab";

interface InviteMemberModalProps {
  open: boolean;
  setOpen: (v: boolean) => void;
  onSubmit: (data: TInvitee[]) => Promise<boolean>;
  organizationId: string;
  membershipRole?: TOrganizationRole;
}

export const InviteMemberModal = ({
  open,
  setOpen,
  onSubmit,
  organizationId,
  membershipRole,
}: Readonly<InviteMemberModalProps>) => {
  const [type, setType] = useState<"individual" | "bulk">("individual");
  const [teams, setTeams] = useState<TOrganizationTeam[]>([]);

  useEffect(() => {
    if (!open) return;
    getTeamsByOrganizationIdAction({ organizationId }).then((fetchedTeams) => {
      setTeams(fetchedTeams?.data ?? []);
    });
  }, [open, organizationId]);

  const { t } = useTranslation();

  const tabs = {
    individual: <IndividualInviteTab setOpen={setOpen} onSubmit={onSubmit} membershipRole={membershipRole} />,
    bulk: <BulkInviteTab setOpen={setOpen} onSubmit={onSubmit} teams={teams} />,
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent disableCloseOnOutsideClick unconstrained>
        <DialogHeader>
          <DialogTitle>{t("workspace.settings.teams.invite_member")}</DialogTitle>
          <DialogDescription>{t("workspace.settings.teams.invite_member_description")}</DialogDescription>
        </DialogHeader>

        <DialogBody className="flex min-h-0 flex-col gap-6 overflow-y-auto">
          <TabToggle
            id="type"
            options={[
              { value: "individual", label: t("workspace.settings.teams.individual") },
              { value: "bulk", label: t("workspace.settings.teams.bulk_invite") },
            ]}
            onChange={(inviteType) => setType(inviteType)}
            defaultSelected={type}
          />
          {tabs[type]}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
};
