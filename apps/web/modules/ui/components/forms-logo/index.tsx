import type { SVGProps } from "react";

export const FormsLogo = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 40 40" role="img" aria-label="Forms" {...props}>
    <rect x="7" y="3" width="26" height="34" rx="6" fill="currentColor" />
    <path
      d="M14 14h12M14 20h12M14 26h7"
      stroke="var(--on-inverse,white)"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);
