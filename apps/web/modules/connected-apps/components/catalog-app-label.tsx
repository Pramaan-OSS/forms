import { PlugIcon } from "lucide-react";

/** The catalogue currently supplies an app id but no display name or icon. */
export function CatalogAppLabel({ app, fallback }: Readonly<{ app?: string; fallback: string }>) {
  return (
    <span className="inline-flex items-center gap-2">
      <PlugIcon aria-hidden="true" className="size-5" />
      {app ?? fallback}
    </span>
  );
}
