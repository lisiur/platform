import { SessionGuard } from "@/components/auth/session-guard";

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <SessionGuard>{children}</SessionGuard>;
}
