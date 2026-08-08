import { SOCKET_PATH } from "./config";
import { closeLog, log } from "./log";
import { startServer } from "./server";

log(`[updater] starting (socket: ${SOCKET_PATH})`);
const server = startServer();

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`[updater] received ${signal}, shutting down`);
  server.close(() => {
    closeLog().finally(() => process.exit(0));
  });
  // Don't let a lingering connection hold shutdown hostage.
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
