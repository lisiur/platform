import { OpenAPIHono } from "@hono/zod-openapi";
import {
  createItem,
  deleteItem,
  enrichItem,
  getItem,
  listItems,
  retryEnrichItem,
  updateItem,
} from "./collection";

const collectionRoutes = new OpenAPIHono();

const routes = collectionRoutes.openapiRoutes([
  listItems,
  createItem,
  getItem,
  updateItem,
  deleteItem,
  enrichItem,
  retryEnrichItem,
] as const);

export { routes as collectionRoutes };
