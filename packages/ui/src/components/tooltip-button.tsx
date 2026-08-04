"use client";

import type { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import type * as React from "react";

import { Button } from "#components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "#components/tooltip";

interface TooltipButtonProps
  extends React.ComponentProps<typeof Button>,
    Pick<
      TooltipPrimitive.Positioner.Props,
      "align" | "alignOffset" | "side" | "sideOffset"
    > {
  tooltip?: React.ReactNode;
  disableHoverablePopup?: boolean;
  delay?: number;
}

function TooltipButton({
  tooltip,
  disableHoverablePopup = true,
  delay = 400,
  disabled,
  side,
  align,
  sideOffset,
  alignOffset,
  ...props
}: TooltipButtonProps) {
  if (tooltip == null) {
    return <Button disabled={disabled} {...props} />;
  }

  return (
    <TooltipProvider delay={delay}>
      <Tooltip
        disableHoverablePopup={disableHoverablePopup}
        disabled={disabled}
      >
        <TooltipTrigger render={<Button disabled={disabled} {...props} />} />
        <TooltipContent
          side={side}
          align={align}
          sideOffset={sideOffset}
          alignOffset={alignOffset}
        >
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { TooltipButton };
