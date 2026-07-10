import { Header } from "@/components/layout/header";

export function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-screen">
      <Header className="h-[var(--header-height)]" />
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
