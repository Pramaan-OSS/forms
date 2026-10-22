"use client";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export function AnswerTextTools({
  responseId,
  elements,
}: Readonly<{ responseId: string; elements: { id: string; label: string }[] }>) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [analysis, setAnalysis] = useState<Record<string, { sentiment?: string; language?: string }>>({});
  const [translation, setTranslation] = useState("");
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/v3/responses/${responseId}/text-tools`;
  useEffect(() => {
    const controller = new AbortController();
    void fetch(endpoint, { signal: controller.signal })
      .then((reply) => (reply.ok ? reply.json() : null))
      .then((body) => {
        if (body) {
          setEnabled(body.data.enabled);
          setAnalysis(body.data.analysis ?? {});
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [endpoint]);
  if (!enabled) return null;
  return (
    <section className="space-y-2 text-sm">
      <h3>{t("text_tools.title")}</h3>
      {elements.map((element) => (
        <div key={element.id}>
          <p>
            {element.label}: {analysis[element.id]?.sentiment} {analysis[element.id]?.language}
          </p>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const reply = await fetch(endpoint, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ elementId: element.id }),
                });
                const body = await reply.json();
                setTranslation(
                  reply.ok ? `${element.label}: ${body.data.text}` : t("text_tools.unavailable")
                );
              } catch {
                setTranslation(t("text_tools.unavailable"));
              } finally {
                setBusy(false);
              }
            }}>
            {t("text_tools.translate_answer")}
          </button>
        </div>
      ))}
      <p>{translation}</p>
    </section>
  );
}
