"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FormProvider, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { OrganizationRole } from "@forms/database/prisma-browser";
import { ZId } from "@forms/types/common";
import { TOrganizationRole, ZOrganizationRole } from "@forms/types/memberships";
import { ZUserName } from "@forms/types/user";
import { AddMemberRole } from "@/modules/organization/settings/teams/components/add-member-role";
import { Alert, AlertDescription } from "@/modules/ui/components/alert";
import { Button } from "@/modules/ui/components/button";
import { Input } from "@/modules/ui/components/input";
import { Label } from "@/modules/ui/components/label";

interface IndividualInviteTabProps {
  setOpen: (v: boolean) => void;
  onSubmit: (
    data: { name: string; email: string; role: TOrganizationRole; teamIds: string[] }[]
  ) => Promise<boolean>;
  membershipRole?: TOrganizationRole;
}

export const IndividualInviteTab = ({ setOpen, onSubmit, membershipRole }: IndividualInviteTabProps) => {
  const ZFormSchema = z.object({
    name: ZUserName,
    email: z
      .email({
        error: "Invalid email",
      })
      .min(1, {
        error: "Email is required",
      }),
    role: ZOrganizationRole,
    teamIds: z.array(ZId),
  });

  type TFormData = z.infer<typeof ZFormSchema>;
  const { t } = useTranslation();
  const defaultRole: TOrganizationRole = "owner";

  const form = useForm<TFormData>({
    resolver: zodResolver(ZFormSchema),
    defaultValues: {
      role: defaultRole,
      teamIds: [],
    },
  });

  const {
    register,
    getValues,
    handleSubmit,
    reset,
    control,
    watch,
    formState: { isSubmitting, errors },
  } = form;

  const submitEventClass = async () => {
    const data = getValues();
    data.role = data.role || OrganizationRole.owner;
    const success = await onSubmit([data]);
    if (success) {
      setOpen(false);
      reset();
    }
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(submitEventClass)} className="flex flex-col gap-6">
        <div className="flex flex-col gap-y-2">
          <Label htmlFor="memberNameInput">{t("common.full_name")}</Label>
          <Input
            id="memberNameInput"
            placeholder="e.g. Bob"
            {...register("name", { required: true, validate: (value) => value.trim() !== "" })}
          />
          {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name.message}</p>}
        </div>
        <div className="flex flex-col gap-y-2">
          <Label htmlFor="memberEmailInput">{t("common.email")}</Label>
          <Input
            id="memberEmailInput"
            type="email"
            placeholder="e.g. bob@work.com"
            {...register("email", { required: true })}
          />
          {errors.email && <p className="mt-1 text-sm text-red-500">{errors.email.message}</p>}
        </div>
        <div>
          <AddMemberRole control={control} membershipRole={membershipRole} />
          {watch("role") === "member" && (
            <Alert className="mt-2" variant="info">
              <AlertDescription>{t("workspace.settings.teams.member_role_info_message")}</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex items-end justify-end gap-x-2">
          <Button
            size="default"
            type="button"
            variant="secondary"
            onClick={() => {
              setOpen(false);
            }}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" size="default" loading={isSubmitting}>
            {t("common.invite")}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
};
