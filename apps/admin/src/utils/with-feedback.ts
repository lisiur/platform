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
  const handleError = (err: unknown) => {
    const error = err instanceof Error ? err : new Error(String(err));

    if (showError) {
      toast.error(config?.errorMessage ?? error.message);
    }
  };

  const hideLoading = () => {
    if (showLoading) {
      loading.hide();
    }
  };

  return (...args: Parameters<T>): ReturnType<T> => {
    if (showLoading) {
      const opts = typeof showLoading === "object" ? showLoading : undefined;
      loading.show(opts);
    }

    let returnedPromise = false;

    try {
      const res = fn(...args);
      if (res instanceof Promise) {
        returnedPromise = true;
        return res
          .catch((err) => {
            handleError(err);
            throw err;
          })
          .finally(hideLoading) as ReturnType<T>;
      }
      return res as ReturnType<T>;
    } catch (err) {
      handleError(err);
      throw err;
    } finally {
      if (!returnedPromise) {
        hideLoading();
      }
    }
  };
}
