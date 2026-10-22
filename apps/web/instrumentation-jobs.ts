import { type JobHandlerOverrides, type JobsRuntimeHandle, startJobsRuntime } from "@forms/jobs";
import { logger } from "@forms/logger";
import { getJobsQueueingConfig, getJobsWorkerBootstrapConfig } from "@/lib/jobs/config";
import { RECURRING_JOB_REGISTRATIONS, getJobHandlerOverrides } from "@/lib/jobs/recurring-registrations";
import { isNewReleaseWorkEnabled } from "@/lib/upgrade/compatibility";

const WORKER_STARTUP_RETRY_DELAY_MS = 30_000;

type TJobsRuntimeGlobal = typeof globalThis & {
  formsServerLifecycle?: { draining: boolean };
  formsJobsRecurringRegistration: Promise<void> | undefined;
  formsJobsRecurringRegistered: boolean | undefined;
  formsJobsRecurringRetryTimeout: ReturnType<typeof setTimeout> | undefined;
  formsJobsRuntime: JobsRuntimeHandle | undefined;
  formsJobsRuntimeInitializing: Promise<JobsRuntimeHandle> | undefined;
  formsJobsRuntimeRetryTimeout: ReturnType<typeof setTimeout> | undefined;
};

const globalForJobsRuntime = globalThis as TJobsRuntimeGlobal;

/**
 * Upsert only — never remove first. `upsertJobScheduler` updates an existing scheduler's repeat options
 * in place (including switching between cron and every), so a remove is unnecessary; it is also harmful.
 * Removing and re-upserting in close succession can leave the scheduler with **no** delayed job at all
 * (bullmq#3063: the upsert finds a job already holding the expected id, but that job is already
 * completed), so the schedule reports a correct next run and never fires again. It also opens a window
 * with no schedule, which a crash between the two calls makes permanent until the next boot.
 *
 * The remove-first this replaces was a reasonable workaround for bullmq#3378 — upsert not updating an
 * existing scheduler — which affected v5.56.9 and earlier. We are on 5.61.0, past that fix.
 *
 * Known trade-off, verified against a real Redis: upsert updates the scheduler's repeat options but
 * leaves the run it has already queued alone, so a changed cron pattern or time zone takes effect from
 * the *next* iteration — up to 24h later for the daily sweeps, 3 minutes for the reconciler. The
 * remove-first moved that pending run immediately. That is the price of never leaving the schedule
 * without a queued run, and it is the right way round: a config change landing one cycle late is
 * recoverable, a schedule that silently stops firing is not.
 */
const registerRecurringJobSchedules = async (): Promise<boolean> => {
  const activated = await isNewReleaseWorkEnabled();
  for (const registration of RECURRING_JOB_REGISTRATIONS) {
    if (registration.requiresReleaseActivation && !activated) continue;
    await registration.job.upsert(registration.schedule);
  }
  return activated;
};

const clearRecurringJobsRetryTimeout = (): void => {
  if (globalForJobsRuntime.formsJobsRecurringRetryTimeout) {
    clearTimeout(globalForJobsRuntime.formsJobsRecurringRetryTimeout);
    globalForJobsRuntime.formsJobsRecurringRetryTimeout = undefined;
  }
};

const scheduleRecurringJobsRetry = (): void => {
  if (
    globalForJobsRuntime.formsJobsRecurringRegistered ||
    globalForJobsRuntime.formsJobsRecurringRegistration ||
    globalForJobsRuntime.formsJobsRecurringRetryTimeout
  ) {
    return;
  }

  globalForJobsRuntime.formsJobsRecurringRetryTimeout = setTimeout(() => {
    globalForJobsRuntime.formsJobsRecurringRetryTimeout = undefined;
    void registerRecurringJobs().catch(() => undefined);
  }, WORKER_STARTUP_RETRY_DELAY_MS);

  logger.warn(
    { retryDelayMs: WORKER_STARTUP_RETRY_DELAY_MS },
    "BullMQ recurring job registration retry scheduled"
  );
};

const clearJobsWorkerRetryTimeout = (): void => {
  if (globalForJobsRuntime.formsJobsRuntimeRetryTimeout) {
    clearTimeout(globalForJobsRuntime.formsJobsRuntimeRetryTimeout);
    globalForJobsRuntime.formsJobsRuntimeRetryTimeout = undefined;
  }
};

const scheduleJobsWorkerRetry = (): void => {
  if (
    globalForJobsRuntime.formsJobsRuntime ||
    globalForJobsRuntime.formsJobsRuntimeInitializing ||
    globalForJobsRuntime.formsJobsRuntimeRetryTimeout
  ) {
    return;
  }

  globalForJobsRuntime.formsJobsRuntimeRetryTimeout = setTimeout(() => {
    globalForJobsRuntime.formsJobsRuntimeRetryTimeout = undefined;
    void registerJobsWorker().catch(() => undefined);
  }, WORKER_STARTUP_RETRY_DELAY_MS);

  logger.warn({ retryDelayMs: WORKER_STARTUP_RETRY_DELAY_MS }, "BullMQ worker registration retry scheduled");
};

export const registerRecurringJobs = async (): Promise<void> => {
  if (globalForJobsRuntime.formsServerLifecycle?.draining) return;
  const jobsQueueingConfig = getJobsQueueingConfig();

  if (!jobsQueueingConfig.enabled || !jobsQueueingConfig.redisUrl) {
    clearRecurringJobsRetryTimeout();
    logger.debug("BullMQ recurring job registration skipped");
    return;
  }

  if (globalForJobsRuntime.formsJobsRecurringRegistered) {
    return;
  }

  if (globalForJobsRuntime.formsJobsRecurringRegistration) {
    return await globalForJobsRuntime.formsJobsRecurringRegistration;
  }

  globalForJobsRuntime.formsJobsRecurringRegistration = (async () => {
    const activated = await registerRecurringJobSchedules();
    clearRecurringJobsRetryTimeout();
    globalForJobsRuntime.formsJobsRecurringRegistered = activated;
    globalForJobsRuntime.formsJobsRecurringRegistration = undefined;
    if (!activated) scheduleRecurringJobsRetry();
  })();

  try {
    return await globalForJobsRuntime.formsJobsRecurringRegistration;
  } catch (error) {
    globalForJobsRuntime.formsJobsRecurringRegistration = undefined;
    logger.error({ err: error }, "BullMQ recurring job registration failed");
    scheduleRecurringJobsRetry();
    throw error;
  }
};

export const registerJobsWorker = async (): Promise<JobsRuntimeHandle | null> => {
  if (globalForJobsRuntime.formsServerLifecycle?.draining) return null;
  const jobsWorkerBootstrapConfig = getJobsWorkerBootstrapConfig();

  if (!jobsWorkerBootstrapConfig.enabled || !jobsWorkerBootstrapConfig.runtimeOptions) {
    clearJobsWorkerRetryTimeout();
    logger.debug("BullMQ worker startup skipped");
    return null;
  }

  if (globalForJobsRuntime.formsJobsRuntime) {
    return globalForJobsRuntime.formsJobsRuntime;
  }

  if (globalForJobsRuntime.formsJobsRuntimeInitializing) {
    return await globalForJobsRuntime.formsJobsRuntimeInitializing;
  }

  const runtimeOptions = jobsWorkerBootstrapConfig.runtimeOptions;
  // The app's handlers win over anything the bootstrap config supplied.
  const jobHandlerOverrides: JobHandlerOverrides = {
    ...runtimeOptions.jobHandlerOverrides,
    ...getJobHandlerOverrides(),
  };

  globalForJobsRuntime.formsJobsRuntimeInitializing = (async () => {
    const runtime = await startJobsRuntime({
      ...runtimeOptions,
      jobHandlerOverrides,
      manageSignals: !globalForJobsRuntime.formsServerLifecycle,
    });

    clearJobsWorkerRetryTimeout();
    globalForJobsRuntime.formsJobsRuntime = runtime;
    globalForJobsRuntime.formsJobsRuntimeInitializing = undefined;
    return runtime;
  })();

  try {
    return await globalForJobsRuntime.formsJobsRuntimeInitializing;
  } catch (error) {
    globalForJobsRuntime.formsJobsRuntimeInitializing = undefined;
    logger.error({ err: error }, "BullMQ worker registration failed");
    scheduleJobsWorkerRetry();
    throw error;
  }
};

export const resetJobsWorkerRegistrationForTests = async (): Promise<void> => {
  const runtime = globalForJobsRuntime.formsJobsRuntime;
  const initializing = globalForJobsRuntime.formsJobsRuntimeInitializing;
  clearRecurringJobsRetryTimeout();
  clearJobsWorkerRetryTimeout();
  globalForJobsRuntime.formsJobsRecurringRegistered = undefined;
  globalForJobsRuntime.formsJobsRecurringRegistration = undefined;
  globalForJobsRuntime.formsJobsRuntime = undefined;
  globalForJobsRuntime.formsJobsRuntimeInitializing = undefined;

  const runtimesToClose = new Set<JobsRuntimeHandle>();

  if (runtime) {
    runtimesToClose.add(runtime);
  }

  if (initializing) {
    try {
      const initializedRuntime = await initializing;
      runtimesToClose.add(initializedRuntime);
    } catch {
      // Startup failures are already surfaced by the test that triggered them.
    }
  }

  if (globalForJobsRuntime.formsJobsRuntime) {
    runtimesToClose.add(globalForJobsRuntime.formsJobsRuntime);
  }

  globalForJobsRuntime.formsJobsRuntime = undefined;
  globalForJobsRuntime.formsJobsRuntimeInitializing = undefined;

  await Promise.all(
    [...runtimesToClose].map(async (runtimeHandle) => {
      try {
        await runtimeHandle.close();
      } catch (error) {
        logger.error({ err: error }, "BullMQ worker test reset close failed");
      }
    })
  );
};
