import { loading } from "@/utils/loading";
import { toast } from "@/utils/toast";

export type WithFeedbackConfig = {
  showLoading?: boolean | { message?: string; duration?: number };
  showError?: boolean;
  errorMessage?: string;
};

// biome-ignore lint/suspicious/noExplicitAny: <>
export function withFeedback<T extends (...args: any[]) => any>(
  fn: T,
  config?: WithFeedbackConfig,
) {
  const showLoading = config?.showLoading ?? false;
  const showError = config?.showError ?? true;

  return (...args: Parameters<T>): ReturnType<T> => {
    if (showLoading) {
      const opts = typeof showLoading === "object" ? showLoading : undefined;
      loading.show(opts);
    }

    try {
      return fn(...args) as ReturnType<T>;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      if (showError) {
        toast.error(config?.errorMessage ?? error.message);
      }

      throw error;
    } finally {
      if (showLoading) {
        loading.hide();
      }
    }
  };
}
