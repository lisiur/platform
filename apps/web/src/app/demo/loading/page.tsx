"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useAsyncData } from "@/hooks/use-async-data";
import { loading } from "@/utils/loading";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function LoadingDemoPage() {
  const t = useTranslations("LoadingDemo");

  const [basicState, basicExecute] = useAsyncData(
    async () => {
      await wait(2000);
      return "done";
    },
    { showLoading: true },
  );

  const [msgState, msgExecute] = useAsyncData(
    async () => {
      await wait(2000);
      return "done";
    },
    { showLoading: { message: "Fetching data..." } },
  );

  const [durState, durExecute] = useAsyncData(
    async () => {
      await wait(500);
      return "done";
    },
    { showLoading: { message: "Saving...", duration: 3000 } },
  );

  return (
    <div className="flex flex-1 flex-col items-center gap-8 overflow-auto p-8">
      <h1 className="text-xl font-semibold">{t("title")}</h1>

      <section className="flex flex-col items-center gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("manual")}
        </h2>
        <div className="flex gap-3">
          <Button onClick={() => loading.show()}>show()</Button>
          <Button variant="outline" onClick={() => loading.hide()}>
            hide()
          </Button>
        </div>
      </section>

      <section className="flex flex-col items-center gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("withMessage")}
        </h2>
        <div className="flex gap-3">
          <Button onClick={() => loading.show({ message: "Loading..." })}>
            show({"{ message }"})
          </Button>
          <Button variant="outline" onClick={() => loading.hide()}>
            hide()
          </Button>
        </div>
      </section>

      <section className="flex flex-col items-center gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("withDuration")}
        </h2>
        <Button
          onClick={() =>
            loading.show({ message: "Working...", duration: 3000 })
          }
        >
          show({"{ message, duration: 3000 }"})
        </Button>
      </section>

      <section className="flex flex-col items-center gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("useAsyncData")}
        </h2>
        <div className="flex gap-3">
          <Button onClick={() => basicExecute()}>basic (2s)</Button>
          <Button onClick={() => msgExecute()}>with message (2s)</Button>
          <Button onClick={() => durExecute()}>with duration (0.5s)</Button>
        </div>
        {basicState.loading && (
          <p className="text-sm text-muted-foreground">basic loading...</p>
        )}
        {basicState.value && (
          <p className="text-sm text-green-600">
            Result: {String(basicState.value)}
          </p>
        )}
        {basicState.error && (
          <p className="text-sm text-destructive">
            Error: {basicState.error.message}
          </p>
        )}
        {msgState.loading && (
          <p className="text-sm text-muted-foreground">msg loading...</p>
        )}
        {msgState.value && (
          <p className="text-sm text-green-600">
            Result: {String(msgState.value)}
          </p>
        )}
        {durState.loading && (
          <p className="text-sm text-muted-foreground">dur loading...</p>
        )}
        {durState.value && (
          <p className="text-sm text-green-600">
            Result: {String(durState.value)}
          </p>
        )}
      </section>
    </div>
  );
}
