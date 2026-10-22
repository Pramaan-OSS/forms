import { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthenticationError } from "@forms/types/errors";
import { getTranslate } from "@/i18n/server";
import { withAuthorizationSurface } from "@/lib/authorization/context";
import { IS_EMAIL_CONFIGURED } from "@/lib/constants";
import { getSession } from "@/modules/auth/lib/session";
import { InviteMembers } from "@/modules/setup/organization/[organizationId]/invite/components/invite-members";
import { hasSetupInviteAccess } from "@/modules/setup/organization/[organizationId]/invite/lib/authorization";

export const metadata: Metadata = {
  title: "Invite",
  description: "Open-source Experience Management. Free & open source.",
};

interface InvitePageProps {
  params: Promise<{ organizationId: string }>;
}

export const InvitePage = async (props: InvitePageProps) => {
  const params = await props.params;
  const t = await getTranslate();
  const session = await getSession();
  if (!session) throw new AuthenticationError(t("common.session_not_found"));

  // Not the security boundary — `inviteOrganizationMemberAction` is — but this asks the action's
  // exact question (`organization.write`, owner-only) so a manager gets a 404 rather than a form
  // that fails on submit. Owner-only is deliberate: `inviteUser` always persists an OWNER invite
  // (ENG-2169).
  //
  // The surface is back (ENG-2409). It was dropped when main replaced `verifyUserRoleAccess` with a
  // `hasSetupInviteAccess` that read a membership row directly — wrapping that would have declared a
  // surface over no `can()` call at all and emitted a zero-check observation. Now that the helper
  // routes through the central interface, the wrapper attributes the authoritative decision to the
  // page surface.
  const mayInvite = await withAuthorizationSurface("page", () =>
    hasSetupInviteAccess(session.user.id, params.organizationId)
  );

  if (!mayInvite) return notFound();

  return <InviteMembers IS_EMAIL_CONFIGURED={IS_EMAIL_CONFIGURED} organizationId={params.organizationId} />;
};
