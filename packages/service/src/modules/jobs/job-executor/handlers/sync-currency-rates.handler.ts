import type { JobHandler } from "#lib/queues/job.types";
import { syncCurrencyRates } from "#modules/billing/currency-rate.service";

export const syncCurrencyRatesHandler: JobHandler = async () => {
  return syncCurrencyRates();
};
