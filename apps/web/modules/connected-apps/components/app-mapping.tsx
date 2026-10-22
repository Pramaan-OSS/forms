"use client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CatalogEntry } from "../lib/connected-apps";
import { CatalogAppLabel } from "./catalog-app-label";

export function AppMapping({
  workspaceId,
  app,
  catalogApp,
  connected,
  surveys,
}: Readonly<{
  workspaceId: string;
  app: string;
  catalogApp?: string;
  connected: boolean;
  surveys: { id: string; name: string }[];
}>) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [actions, setActions] = useState<CatalogEntry[]>([]);
  const [action, setAction] = useState("");
  const [surveyId, setSurveyId] = useState(surveys[0]?.id ?? "");
  const [input, setInput] = useState("{}");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/v3/workspaces/${workspaceId}/connected-apps/${app}`;
  const run = async (save: boolean) => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(save ? endpoint : `${endpoint}?query=${encodeURIComponent(query)}`, {
        method: save ? "PUT" : "GET",
        ...(save
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query, action, surveyId, input: JSON.parse(input) }),
            }
          : {}),
      });
      if (!response.ok) throw new Error();
      const body = await response.json();
      if (save) setMessage(t("workspace.integrations.mapping_saved"));
      else {
        setActions(body.data);
        setAction("");
      }
    } catch {
      setMessage(t("workspace.integrations.mapping_unavailable"));
    } finally {
      setBusy(false);
    }
  };
  const selected = actions.find((item) => item.action === action);
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-8">
      <h1 className="text-2xl font-normal">
        <CatalogAppLabel app={catalogApp} fallback={t("common.connected_apps")} />
      </h1>
      <p>{t("workspace.integrations.connected_apps_description")}</p>
      <a className="underline" href={`/api/connected-apps/${app}/start?workspaceId=${workspaceId}`}>
        {t(connected ? "common.manage" : "common.connect")}
      </a>
      <label className="block">
        {t("workspace.integrations.action_search")}
        <input
          className="block w-full rounded border p-2"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <button disabled={busy || !query} onClick={() => void run(false)}>
        {t("common.search")}
      </button>
      <select
        aria-label={t("workspace.integrations.action_search")}
        value={action}
        onChange={(e) => setAction(e.target.value)}
        className="block w-full rounded border p-2">
        <option value="">{t("common.select")}</option>
        {actions.map((item) => (
          <option key={item.action} value={item.action}>
            {item.app}: {item.description ?? item.action}
          </option>
        ))}
      </select>
      {selected && (
        <pre className="overflow-auto rounded bg-slate-100 p-3">
          {JSON.stringify(selected.inputSchema, null, 2)}
        </pre>
      )}
      <select
        aria-label={t("common.survey")}
        value={surveyId}
        onChange={(e) => setSurveyId(e.target.value)}
        className="block w-full rounded border p-2">
        {surveys.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <label className="block">
        {t("workspace.integrations.mapping_input")}
        <textarea
          className="block min-h-40 w-full rounded border p-2"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      </label>
      <p className="text-sm text-slate-600">{t("workspace.integrations.mapping_help")}</p>
      <button disabled={busy || !connected || !action || !surveyId} onClick={() => void run(true)}>
        {t("common.save")}
      </button>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const reply = await fetch(endpoint, { method: "DELETE" });
            setMessage(
              t(
                reply.ok
                  ? "workspace.integrations.mapping_removed"
                  : "workspace.integrations.mapping_unavailable"
              )
            );
          } catch {
            setMessage(t("workspace.integrations.mapping_unavailable"));
          } finally {
            setBusy(false);
          }
        }}>
        {t("workspace.integrations.mapping_remove")}
      </button>
      <p role="status">{message}</p>
    </main>
  );
}
