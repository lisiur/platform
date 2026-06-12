import { SidebarInset, SidebarProvider, TooltipProvider } from "@repo/ui";
import { SessionGuard } from "@/components/auth/session-guard";
import { AppSidebar } from "@/components/layout/sidebar";
import { SidebarBorderTrigger } from "@/components/layout/sidebar-border-trigger";
import { SidebarToggleListener } from "@/components/layout/sidebar-toggle-listener";

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SessionGuard>
      <TooltipProvider>
        <SidebarProvider>
          <SidebarToggleListener />
          <AppSidebar />
          <SidebarBorderTrigger />
          <SidebarInset>{children}</SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </SessionGuard>
  );
}
