type JsonSchema = {
  type?: string;
  format?: string;
  enum?: unknown[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  description?: string;
  nullable?: boolean;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  $ref?: string;
};

type OpenApiParameter = {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  schema?: JsonSchema;
  description?: string;
};

export type OpenApiDocument = {
  openapi: string;
  paths: Record<
    string,
    Record<
      string,
      {
        operationId?: string;
        summary?: string;
        description?: string;
        tags?: string[];
        parameters?: OpenApiParameter[];
        requestBody?: {
          required?: boolean;
          content?: Record<string, { schema?: JsonSchema }>;
        };
      }
    >
  >;
};

export type OperationDescriptor = {
  operationId: string;
  method: string;
  path: string;
  summary?: string;
  description?: string;
  tags?: string[];
};

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3000";

let cachedSpec: OpenApiDocument | null = null;
let operationMap: Map<
  string,
  {
    method: string;
    path: string;
    operation: OperationDescriptor;
    raw: OpenApiDocument["paths"][string][string];
  }
> | null = null;
let operationsList: OperationDescriptor[] | null = null;

function buildOperationCache(spec: OpenApiDocument): void {
  const map = new Map<
    string,
    {
      method: string;
      path: string;
      operation: OperationDescriptor;
      raw: OpenApiDocument["paths"][string][string];
    }
  >();
  const list: OperationDescriptor[] = [];

  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const m of HTTP_METHODS) {
      const op = methods[m];
      if (!op) continue;
      const id = op.operationId;
      if (!id) {
        console.warn(
          `[openapi] Missing operationId for ${m.toUpperCase()} ${path}, skipping`,
        );
        continue;
      }
      const entry: OperationDescriptor = {
        operationId: id,
        method: m.toUpperCase(),
        path,
        summary: op.summary,
        description: op.description,
        tags: op.tags,
      };
      list.push(entry);
      map.set(id, { method: m.toUpperCase(), path, operation: entry, raw: op });
    }
  }

  operationMap = map;
  operationsList = list.sort((a, b) =>
    a.operationId.localeCompare(b.operationId),
  );
}

async function getPlatformOpenApiSpec(): Promise<OpenApiDocument> {
  if (cachedSpec) return cachedSpec;

  const url = `${API_ORIGIN.replace(/\/$/, "")}/api/openapi.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Failed to load OpenAPI spec from ${url}: ${res.status} ${res.statusText}`,
    );
  }
  cachedSpec = (await res.json()) as OpenApiDocument;
  buildOperationCache(cachedSpec);
  return cachedSpec;
}

const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
] as const;

export async function listAvailableOperations(): Promise<
  OperationDescriptor[]
> {
  await getPlatformOpenApiSpec();
  return operationsList as OperationDescriptor[];
}

export async function findOperation(operationId: string): Promise<{
  method: string;
  path: string;
  operation: OperationDescriptor;
  raw: OpenApiDocument["paths"][string][string];
} | null> {
  await getPlatformOpenApiSpec();
  return operationMap?.get(operationId) ?? null;
}

export type RawOperation = OpenApiDocument["paths"][string][string];

export function isMultipartOperation(raw: RawOperation): boolean {
  return Object.keys(raw.requestBody?.content ?? {}).includes(
    "multipart/form-data",
  );
}

export function getBinaryFieldNames(raw: RawOperation): Set<string> {
  const schema = raw.requestBody?.content?.["multipart/form-data"]?.schema;
  const props = schema?.properties ?? {};
  return new Set(
    Object.entries(props)
      .filter(([, s]) => s?.format === "binary")
      .map(([name]) => name),
  );
}
