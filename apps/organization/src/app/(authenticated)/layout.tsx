import { SessionGuard } from "@/components/auth/session-guard";

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SessionGuard>
      <main className="min-h-screen bg-muted/30">
        <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 md:px-8">
          {children}
        </div>
      </main>
    </SessionGuard>
  );
}
