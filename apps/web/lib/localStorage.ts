export const FORMS_SURVEYS_FILTERS_KEY_LS = "forms-surveys-filters";
export const FORMS_WORKFLOWS_FILTERS_KEY_LS = "forms-workflows-filters";
export const FORMS_ENVIRONMENT_ID_LS = "forms-environment-id";
export const FORMS_WORKSPACE_ID_LS = "forms-workspace-id";
export const FORMS_LOGGED_IN_WITH_LS = "forms-logged-in-with";

// Server-readable mirror of the "last active workspace". The proxy sets this from the
// /workspaces/[workspaceId] path so server components (e.g. the workspace-agnostic org-settings
// shell) can resolve the current workspace during render — localStorage is browser-only.
export const FORMS_WORKSPACE_ID_COOKIE = "forms-workspace-id";

// Server-readable "last active organization", set by the proxy from /organizations/[organizationId]
// paths and cleared again on any /workspaces/[workspaceId] visit. It only exists while the most recent
// org-scoped visit is newer than the last workspace visit — e.g. an organization with no workspace
// yet (its landing page) — which is exactly when the workspace cookie above names the wrong
// organization. Account settings, which carry no organization in the URL, read it first.
export const FORMS_ORGANIZATION_ID_COOKIE = "forms-organization-id";
