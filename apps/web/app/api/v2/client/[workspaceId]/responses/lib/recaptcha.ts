import { env } from "@/lib/env";
import { pramaan } from "@/lib/pramaan";

/** The shared response gate fails closed when an enabled widget cannot verify its token. */
export const verifyRecaptchaToken = async (token: string, threshold: number): Promise<boolean> => {
  if (!pramaan || !env.PRAMAAN_BOT_CHECK_WIDGET) return false;
  try {
    const result = (await pramaan.call(
      "auth.bot-check.verify",
      {
        token,
        widget: env.PRAMAAN_BOT_CHECK_WIDGET,
        minimumScore: threshold,
      },
      { signal: AbortSignal.timeout(5000) }
    )) as { passed?: boolean };
    return result.passed === true;
  } catch {
    return false;
  }
};
