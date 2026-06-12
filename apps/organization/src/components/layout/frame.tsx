import { Header } from "@/components/layout/header";

export function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      <Header className="h-[var(--header-height)]" />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
