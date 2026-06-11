import { app } from "@repo/service";
import { handle } from "hono/vercel";

export type AppType = typeof app;

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
