import type { ReactNode } from "react";

interface ManagementPageShellProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}

export function ManagementPageShell({
  title,
  description,
  children,
}: ManagementPageShellProps) {
  return (
    <div className="container mx-auto flex h-full min-h-0 flex-col overflow-hidden py-8">
      <div className="mb-6 shrink-0">
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}
