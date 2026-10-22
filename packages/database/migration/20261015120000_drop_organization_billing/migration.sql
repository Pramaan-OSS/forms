-- Paid tiers are removed from the template: every organization carries the same
-- in-code plan limits, so the per-organization billing row has nothing left to hold.
DROP TABLE "OrganizationBilling";
