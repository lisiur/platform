"use client";

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

interface DialogOptions<R> {
  defaultValue: R;
  title?: ReactNode;
  description?: ReactNode;
  content?: ReactNode;
  footer?: (close: (result: R) => void) => ReactNode;
}

export function useDialog<P extends object, R>(
  createOptions: (props: P) => DialogOptions<R>,
): [(props: P) => Promise<R>, (result: R) => void] {
  const controllerRef = useRef<AbortController | null>(null);
  const cleanupRef = useRef<((result: R) => void) | null>(null);
  const createOptionsRef = useRef(createOptions);
  createOptionsRef.current = createOptions;

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  const closeDialog = useCallback((result: R) => {
    controllerRef.current?.abort();
    cleanupRef.current?.(result);
  }, []);

  const openDialog = useCallback((props: P) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    const opts = createOptionsRef.current(props);
    return showDialog(opts, controller.signal, (cleanup) => {
      cleanupRef.current = cleanup;
    });
  }, []);

  return [openDialog, closeDialog];
}

function showDialog<R>(
  options: DialogOptions<R>,
  signal: AbortSignal | undefined,
  registerCleanup: (cleanup: (result: R) => void) => void,
): Promise<R> {
  return new Promise((resolve) => {
    let settled = false;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    function cleanup(result: R) {
      if (settled) return;
      settled = true;
      root.unmount();
      container.remove();
      resolve(result);
    }

    registerCleanup(cleanup);

    signal?.addEventListener("abort", () => cleanup(options.defaultValue), {
      once: true,
    });

    function DialogWrapper() {
      const [open, setOpen] = useState(true);

      function handleClose(result: R) {
        setOpen(false);
        setTimeout(() => cleanup(result), 200);
      }

      return (
        <Dialog
          open={open}
          onOpenChange={(isOpen) =>
            !isOpen && handleClose(options.defaultValue)
          }
        >
          <DialogContent>
            {options.title && (
              <DialogHeader>
                <DialogTitle>{options.title}</DialogTitle>
                {options.description && (
                  <DialogDescription>{options.description}</DialogDescription>
                )}
              </DialogHeader>
            )}
            {options.content && <DialogBody>{options.content}</DialogBody>}
            {options.footer && (
              <DialogFooter>{options.footer(handleClose)}</DialogFooter>
            )}
          </DialogContent>
        </Dialog>
      );
    }

    root.render(<DialogWrapper />);
  });
}
