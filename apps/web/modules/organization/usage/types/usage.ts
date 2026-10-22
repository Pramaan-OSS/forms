export type TOrganizationUsageWorkspace = {
  id: string;
  name: string;
  responseCount: number;
};

export type TOrganizationUsage = {
  workspaces: TOrganizationUsageWorkspace[];
  totals: { responseCount: number };
  surveys: {
    draft: number;
    scheduled: number;
    inProgress: number;
    paused: number;
    completed: number;
    archived: number;
  };
  members: { total: number; active: number; dormant: number; deactivated: number };
  /** The IANA zone the range's calendar days were cut in, so the page can say so. */
  timeZone: string;
};
