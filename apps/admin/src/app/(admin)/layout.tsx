import { SessionGuard } from "@/components/auth/session-guard";
import { AppSidebar } from "@/components/layout/sidebar";
import { SidebarBorderTrigger } from "@/components/layout/sidebar-border-trigger";
import { SidebarToggleListener } from "@/components/layout/sidebar-toggle-listener";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

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
