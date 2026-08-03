"use client";

import { useQuery } from "@tanstack/react-query";
import { appClient, withApiFeedback } from "@/lib/api";

const ICP_URL = "https://beian.miit.gov.cn/";
const PSIF_URL = "https://beian.mps.gov.cn/";

export function AuthFooter() {
  const { data: app } = useQuery({
    queryKey: ["applications", "current", "footer"],
    queryFn: async () => {
      const res = await withApiFeedback(
        appClient.api.applications.current.$get,
        {
          showError: false,
        },
      )();
      return res.json();
    },
    retry: false,
  });

  const copyright = app?.copyright;
  const icp = app?.icp;
  const psif = app?.psif;

  return (
    <footer className="flex h-20 flex-col items-center justify-center gap-1 px-4 text-center text-xs text-muted-foreground">
      {copyright && <p>{copyright}</p>}
      {(icp || psif) && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {icp && (
            <a
              href={ICP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              {icp}
            </a>
          )}
          {psif && (
            <a
              href={PSIF_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              {psif}
            </a>
          )}
        </div>
      )}
    </footer>
  );
}
