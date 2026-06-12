"use client";

import { FieldLabel, Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui";
import { Info } from "lucide-react";
import type { ReactNode } from "react";

interface ConfigFieldLabelProps {
  label: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  className?: string;
}

export function ConfigFieldLabel({
  label,
  description,
  htmlFor,
  className,
}: ConfigFieldLabelProps) {
  return (
    <div className="flex items-center gap-1.5">
      <FieldLabel htmlFor={htmlFor} className={className}>
        {label}
      </FieldLabel>
      {description && (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label="Show field description"
                className="inline-flex cursor-default text-muted-foreground transition-colors hover:text-foreground"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            }
            delay={0}
          />
          <TooltipContent side="right" align="center">
            {description}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
