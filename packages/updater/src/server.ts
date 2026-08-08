import { randomUUID } from "node:crypto";
import { chmodSync, unlinkSync } from "node:fs";
import http from "node:http";
import { SOCKET_PATH } from "./config";
import { isBusy, release, tryAcquire } from "./lock";
import { log } from "./log";
import { isCancellable, requestCancel, runPipeline } from "./pipeline";
import { getStatus, subscribe } from "./state";
import type { ApplyRequest, ApplyUpdateMode } from "./types";

const MODES: ApplyUpdateMode[] = ["update", "redeploy"];

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(json),
  });
  res.end(json);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (chunk) => {
      buf += chunk;
      if (buf.length > 1 << 20) {
        req.destroy();
        reject(new Error("request body too large"));
      }
    });
    req.on("end", () => resolve(buf));
    req.on("error", reject);
  });
}

export function startServer(): http.Server {
  // Remove a stale socket left by a previous crash.
  try {
    unlinkSync(SOCKET_PATH);
  } catch {
    // didn't exist
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://updater");

      if (req.method === "GET" && url.pathname === "/health") {
        const s = getStatus();
        const wedged = s.phase === "failed" && s.step === "interrupted";
        return sendJson(res, wedged ? 503 : 200, {
          status: wedged ? "wedged" : "ok",
          busy: isBusy(),
          phase: s.phase,
        });
      }

      if (req.method === "GET" && url.pathname === "/status") {
        return sendJson(res, 200, getStatus());
      }

      if (req.method === "GET" && url.pathname === "/events") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        // Send the current status immediately so a late subscriber resyncs.
        res.write(`data: ${JSON.stringify(getStatus())}\n\n`);
        const unsubscribe = subscribe((s) => {
          res.write(`data: ${JSON.stringify(s)}\n\n`);
        });
        req.on("close", () => unsubscribe());
        return;
      }

      if (req.method === "POST" && url.pathname === "/update") {
        const body = JSON.parse(await readBody(req)) as Partial<ApplyRequest>;
        if (
          !body.tarballUrl ||
          !body.targetTag ||
          !body.mode ||
          !MODES.includes(body.mode)
        ) {
          return sendJson(res, 400, {
            message:
              "tarballUrl, targetTag, and mode (update|redeploy) are required.",
          });
        }
        if (!tryAcquire()) {
          return sendJson(res, 409, {
            message: "An update is already in progress.",
          });
        }
        const jobId = randomUUID();
        // Run without awaiting so the request returns immediately; the lock is
        // released when the pipeline settles.
        runPipeline({
          tarballUrl: body.tarballUrl,
          targetTag: body.targetTag,
          mode: body.mode,
        })
          .catch((err: unknown) =>
            log(`[pipeline] uncaught: ${(err as Error).message}`),
          )
          .finally(() => release());
        return sendJson(res, 202, { jobId });
      }

      if (req.method === "POST" && url.pathname === "/cancel") {
        if (!isCancellable()) {
          return sendJson(res, 409, {
            message: "No cancellable download is in progress.",
          });
        }
        requestCancel();
        return sendJson(res, 202, { cancelled: true });
      }

      return sendJson(res, 404, { message: "Not found" });
    } catch (err) {
      log(`[server] error: ${(err as Error).message}`);
      return sendJson(res, 500, { message: (err as Error).message });
    }
  });

  server.listen(SOCKET_PATH, () => {
    // Restrict to the deploy user (same user as the apps) — no token needed.
    try {
      chmodSync(SOCKET_PATH, 0o600);
    } catch (err) {
      log(`[server] chmod failed: ${(err as Error).message}`);
    }
    log(`[server] listening on ${SOCKET_PATH}`);
  });
  server.on("error", (err) => log(`[server] listen error: ${err.message}`));

  return server;
}
