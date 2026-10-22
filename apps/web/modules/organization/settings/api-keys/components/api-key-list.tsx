import { TUserLocale } from "@forms/types/user";
import { getApiKeysWithEnvironmentPermissions } from "@/modules/organization/settings/api-keys/lib/api-key";
import { TOrganizationWorkspace } from "@/modules/organization/settings/api-keys/types/api-keys";
import { EditAPIKeys } from "./edit-api-keys";

interface ApiKeyListProps {
  organizationId: string;
  locale: TUserLocale;
  workspaces: TOrganizationWorkspace[];
  canGrantOrganizationWriteAccess: boolean;
}

export const ApiKeyList = async ({
  organizationId,
  locale,
  workspaces,
  canGrantOrganizationWriteAccess,
}: Readonly<ApiKeyListProps>) => {
  const apiKeys = await getApiKeysWithEnvironmentPermissions(organizationId);

  return (
    <EditAPIKeys
      organizationId={organizationId}
      apiKeys={apiKeys}
      locale={locale}
      workspaces={workspaces}
      canGrantOrganizationWriteAccess={canGrantOrganizationWriteAccess}
    />
  );
};
