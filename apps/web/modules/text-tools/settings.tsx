"use client";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function TextToolSettings({
  workspaceId,
  initial,
  canManage,
}: Readonly<{ workspaceId: string; initial: { enabled: boolean; language: string }; canManage: boolean }>) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [language, setLanguage] = useState(initial.language);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="space-y-4 rounded-lg border p-6">
      <h2>{t("text_tools.title")}</h2>
      <p>{t("text_tools.description")}</p>
      <label className="block">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!canManage}
          onChange={(e) => setEnabled(e.target.checked)}
        />{" "}
        {t("text_tools.enable")}
      </label>
      <label className="block">
        {t("text_tools.language")}
        <input
          className="ml-3 rounded border p-2"
          value={language}
          disabled={!canManage}
          onChange={(e) => setLanguage(e.target.value)}
        />
      </label>
      <button
        disabled={!canManage || busy}
        onClick={async () => {
          setBusy(true);
          try {
            const reply = await fetch(`/api/v3/workspaces/${workspaceId}/text-tools`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ enabled, language }),
            });
            setMessage(t(reply.ok ? "workspace.surveys.edit.changes_saved" : "text_tools.unavailable"));
          } catch {
            setMessage(t("text_tools.unavailable"));
          } finally {
            setBusy(false);
          }
        }}>
        {t("common.save")}
      </button>
      <p role="status">{message}</p>
    </section>
  );
}
