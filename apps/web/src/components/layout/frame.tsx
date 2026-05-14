import { Header } from "@/components/layout/header";

export function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <Header className="sticky top-0 z-50 h-[var(--header-height)]" />
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
