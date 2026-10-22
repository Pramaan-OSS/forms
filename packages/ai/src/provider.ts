import { MissingPramaanKey, pramaanFromEnv, pramaanKeySet } from "@forms/pramaan";

/**
 * Generation runs on the workspace's one platform key: configured when
 * `PRAMAAN_API_KEY` is set, nothing else to validate.
 */
export const isAiConfigured = (_env?: unknown): boolean => pramaanKeySet();

/** The client for one call, or the typed missing-key error a caller maps for the UI. */
export const aiClient = () => {
  const client = pramaanFromEnv();
  if (!client) throw new MissingPramaanKey();
  return client;
};

export interface AIConfigurationStatus {
  isConfigured: boolean;
}

export const getAiConfigurationStatus = (): AIConfigurationStatus => ({
  isConfigured: isAiConfigured(),
});

export { AIConfigurationError } from "./errors";
