export type JsonSchemaProperty = {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  format?: string;
};

export type JsonObjectSchema = {
  type?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSupportedObjectSchema(
  schema: unknown,
): schema is JsonObjectSchema {
  if (
    !isRecord(schema) ||
    schema.type !== "object" ||
    !isRecord(schema.properties)
  ) {
    return false;
  }

  return Object.values(schema.properties).every((property) => {
    if (!isRecord(property)) return false;
    return ["boolean", "string", "number"].includes(
      typeof property.type === "string" ? property.type : "",
    );
  });
}

export function getDefaultConfig(schema: unknown) {
  if (!isSupportedObjectSchema(schema)) return null;

  const config: Record<string, unknown> = {};
  for (const [key, property] of Object.entries(schema.properties ?? {})) {
    if (property.default !== undefined) {
      config[key] = property.default;
    } else if (property.type === "boolean") {
      config[key] = false;
    } else if (property.type === "number") {
      config[key] = 0;
    } else {
      config[key] = "";
    }
  }
  return config;
}

export function formatJson(value: unknown) {
  if (value === null || value === undefined) return "";
  return JSON.stringify(value, null, 2);
}

export function parseOptionalJson(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
}
