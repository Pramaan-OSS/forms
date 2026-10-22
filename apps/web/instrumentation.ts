import { logger } from "@forms/logger";
import { PROMETHEUS_ENABLED } from "@/lib/constants";
import {
  assertAuthRuntimeConfiguration,
  assertAuthzedRuntimeConfiguration,
  warnOnAuthSecretRisks,
} from "@/lib/env";

export const register = async () => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NEXT_PHASE !== "phase-production-build") {
      assertAuthzedRuntimeConfiguration();
      assertAuthRuntimeConfiguration();
      warnOnAuthSecretRisks();
    }

    // Load OpenTelemetry instrumentation when Prometheus metrics or OTLP export is enabled
    if (PROMETHEUS_ENABLED || process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
      await import("./instrumentation-node");
    }

    // Skip runtime-only BullMQ bootstrapping during production builds.
    if (process.env.NEXT_PHASE !== "phase-production-build") {
      try {
        const { registerOnlinePauseDelivery } = await import("./lib/upgrade/pause-delivery");
        registerOnlinePauseDelivery();
        const { registerJobsWorker, registerRecurringJobs } = await import("./instrumentation-jobs");
        void registerRecurringJobs().catch((error: unknown) => {
          logger.error(
            { err: error },
            "BullMQ recurring job registration failed during Next.js instrumentation"
          );
        });
        void registerJobsWorker().catch((error: unknown) => {
          logger.error({ err: error }, "BullMQ worker registration failed during Next.js instrumentation");
        });
      } catch (error) {
        logger.error({ err: error }, "BullMQ instrumentation import failed during Next.js instrumentation");
      }
    }
  }
};
