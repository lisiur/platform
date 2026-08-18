import { OpenAPIHono } from "@hono/zod-openapi";
import {
  createItem,
  deleteItem,
  enrichItem,
  exportItems,
  getItem,
  importItems,
  listItems,
  retryEnrichItem,
  updateItem,
} from "./collection";

const collectionRoutes = new OpenAPIHono();

const routes = collectionRoutes.openapiRoutes([
  listItems,
  createItem,
  exportItems,
  importItems,
  getItem,
  updateItem,
  deleteItem,
  enrichItem,
  retryEnrichItem,
] as const);

export { routes as collectionRoutes };
