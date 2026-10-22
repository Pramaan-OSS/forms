"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type Translation = { path: string; language: string; text?: string; notes?: string };
export function TranslateSurvey({
  surveyId,
  workspaceId,
  languageCode,
  strings,
  onApply,
}: Readonly<{
  surveyId: string;
  workspaceId: string;
  languageCode: string;
  strings: { path: string; text: string }[];
  onApply: (translations: Translation[]) => void;
}>) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [languages, setLanguages] = useState(languageCode);
  const [rows, setRows] = useState<Translation[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const check = new AbortController();
    void fetch(`/api/v3/workspaces/${workspaceId}/text-tools`, { signal: check.signal })
      .then((reply) => (reply.ok ? reply.json() : null))
      .then((body) => setEnabled(body?.data.enabled ?? false))
      .catch(() => {});
    return () => {
      check.abort();
      controller.current?.abort();
    };
  }, [workspaceId]);
  if (!enabled) return null;
  return (
    <section className="space-y-2 rounded border p-3">
      <p>{t("text_tools.review")}</p>
      <label>
        {t("text_tools.languages")}
        <input
          className="ml-2 rounded border p-2"
          value={languages}
          disabled={busy}
          onChange={(e) => setLanguages(e.target.value)}
        />
      </label>
      <button
        disabled={busy}
        onClick={async () => {
          const abort = new AbortController();
          controller.current = abort;
          setBusy(true);
          setMessage("");
          setRows([]);
          const results: Translation[] = [];
          try {
            for (const item of strings) {
              if (abort.signal.aborted) break;
              const reply = await fetch(`/api/v3/surveys/${surveyId}/translate`, {
                method: "POST",
                signal: abort.signal,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  text: item.text,
                  languages: languages.split(",").map((item) => item.trim().toLowerCase()),
                }),
              });
              if (!reply.ok) {
                setMessage(
                  t(
                    reply.status === 429
                      ? "text_tools.busy"
                      : reply.status === 409
                        ? "text_tools.cancelled"
                        : "text_tools.unavailable"
                  )
                );
                return;
              }
              const body = await reply.json();
              results.push(
                ...body.data.translations.map((row: Omit<Translation, "path">) => ({
                  ...row,
                  path: item.path,
                }))
              );
              setRows([...results]);
            }
          } catch {
            setMessage(t(abort.signal.aborted ? "text_tools.cancelled" : "text_tools.unavailable"));
          } finally {
            setBusy(false);
          }
        }}>
        {t("text_tools.translate_survey")}
      </button>
      {busy && <button onClick={() => controller.current?.abort()}>{t("common.cancel")}</button>}
      <p role="status">{message}</p>
      {rows.map((row) => (
        <div className="border-t py-2" key={`${row.path}-${row.language}`}>
          <p>
            {row.language}: {row.text ?? t("text_tools.unavailable")}
          </p>
          <p className="text-sm">{row.notes}</p>
        </div>
      ))}
      {rows.length > 0 && !busy && (
        <button
          onClick={() => {
            onApply(rows.filter((row) => typeof row.text === "string"));
            setRows([]);
          }}>
          {t("text_tools.use_reviewed")}
        </button>
      )}
    </section>
  );
}
