import type { SVGProps } from "react";

export const Logo = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 170 44" role="img" aria-label="Forms" {...props}>
    <text x="2" y="33" fill="currentColor" fontFamily="Fraunces, Georgia, serif" fontSize="38">
      Forms
    </text>
    <circle cx="132" cy="29" r="3" fill="currentColor" />
  </svg>
);
