import { HTTPException } from "hono/http-exception";

type Variables = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getVariable(path: string, variables: Variables) {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!isRecord(current)) return undefined;
    return current[segment];
  }, variables);
}

function assertVariableType(
  name: string,
  value: unknown,
  expectedType: string,
) {
  const valid =
    (expectedType === "array" && Array.isArray(value)) ||
    (expectedType === "object" && isRecord(value)) ||
    (expectedType !== "array" &&
      expectedType !== "object" &&
      typeof value === expectedType);

  if (!valid) {
    throw new HTTPException(400, {
      message: `Notification variable "${name}" must be ${expectedType}`,
    });
  }
}

export function validateTemplateVariables(
  variablesSchema: unknown,
  variables: Variables,
) {
  if (!isRecord(variablesSchema)) return;

  const required = Array.isArray(variablesSchema.required)
    ? variablesSchema.required.filter(
        (key): key is string => typeof key === "string",
      )
    : [];

  for (const key of required) {
    if (getVariable(key, variables) === undefined) {
      throw new HTTPException(400, {
        message: `Missing notification variable "${key}"`,
      });
    }
  }

  const properties = isRecord(variablesSchema.properties)
    ? variablesSchema.properties
    : {};

  for (const [name, property] of Object.entries(properties)) {
    if (!isRecord(property) || typeof property.type !== "string") continue;
    const value = getVariable(name, variables);
    if (value === undefined || value === null) continue;
    assertVariableType(name, value, property.type);
  }
}

export function renderTemplate(
  template: string | null | undefined,
  variables: Variables,
) {
  if (!template) return null;

  return template.replace(
    /{{\s*([A-Za-z0-9_.-]+)\s*}}/g,
    (_match, key: string) => {
      const value = getVariable(key, variables);
      if (value === undefined || value === null) {
        throw new HTTPException(400, {
          message: `Missing notification variable "${key}"`,
        });
      }
      if (typeof value === "string") return value;
      if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
      }
      return JSON.stringify(value);
    },
  );
}
