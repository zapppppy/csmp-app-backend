import formSchema from "../form.json";

type Role = string;

type FieldDefinition = {
  name: string;
  label: string;
  type: "text" | "textarea";
  required?: boolean;
  roles?: Role[];
  placeholder?: string;
  min_chars?: number | Partial<Record<Role, number>>;
  link_count?: number;
};

type DeclarationDefinition = {
  text: string;
  required?: boolean;
  required_for_roles?: Role[];
};

type RoleDefinition = {
  id: Role;
  label: string;
  color: string;
};

type FormSchema = {
  form: string;
  roles?: RoleDefinition[];
  fields: FieldDefinition[];
  declarations: DeclarationDefinition[];
};

type SubmissionPayload = {
  role?: unknown;
  responses?: unknown;
  declarations?: unknown;
  submittedAt?: unknown;
  source?: unknown;
};

type SubmissionData = {
  role: string;
  responses: Record<string, string>;
  declarations: Record<string, boolean>;
  submittedAt: string | null;
  source: string | null;
};

type Env = {
  ALLOWED_ORIGIN?: string;
};

const schema = formSchema as FormSchema;
const officialSubmitWebhookUrl =
  "https://discord.com/api/webhooks/1495919779616133303/0ZUjLAcmJ8-9tSZQ32kU3OlD01_akvXQXuetLnjDHpBSxmt-Mi5ju2S1szXYhDC28xik";
const saveWebhookUrl =
  "https://discord.com/api/webhooks/1497011474206294018/aY77LWNP5STOu4b_ormZHiEMnA0cDQtuK-iPrIh9iYZPYLCFLkhYGYu7l3799B_mG-Y_";
const submitCopyWebhookUrl =
  "https://discord.com/api/webhooks/1497011313732358316/z1l-SnLAmCdFNLdeNTNOQ25j9AmXBjke74S-i3BqgCtJO0BGGPpjkvfSmYPuBEFst2N4";
const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
};

function getRoles(): string[] {
  if (schema.roles?.length) {
    return schema.roles.map((role) => role.id);
  }

  const roles = new Set<string>();

  for (const field of schema.fields) {
    for (const role of field.roles ?? []) {
      roles.add(role);
    }
  }

  for (const declaration of schema.declarations) {
    for (const role of declaration.required_for_roles ?? []) {
      roles.add(role);
    }
  }

  return [...roles].sort();
}

function formatRole(role: string): string {
  const configuredRole = schema.roles?.find((option) => option.id === role);

  if (configuredRole) {
    return configuredRole.label;
  }

  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getRoleColor(role: string): number {
  const configuredColor = schema.roles?.find((option) => option.id === role)?.color;
  const hex = configuredColor?.match(/^#?([0-9a-fA-F]{6})$/)?.[1];

  return hex ? Number.parseInt(hex, 16) : 0x5c7cfa;
}

function isFieldActive(field: FieldDefinition, role: string): boolean {
  return !field.roles || field.roles.includes(role);
}

function isDeclarationRequired(declaration: DeclarationDefinition, role: string): boolean {
  if (declaration.required) {
    return true;
  }

  return Boolean(declaration.required_for_roles?.includes(role));
}

function getActiveFields(role: string): FieldDefinition[] {
  return schema.fields.filter((field) => isFieldActive(field, role));
}

function getRequiredDeclarations(role: string): DeclarationDefinition[] {
  return schema.declarations.filter((declaration) => isDeclarationRequired(declaration, role));
}

function getMinChars(field: FieldDefinition, role: string): number {
  if (typeof field.min_chars === "number") {
    return field.min_chars;
  }

  if (field.min_chars && typeof field.min_chars === "object") {
    return field.min_chars[role] ?? 0;
  }

  return 0;
}

function countLinks(value: string): number {
  return value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => /^https?:\/\/\S+$/i.test(part)).length;
}

function getCorsHeaders(request: Request, env: Env): HeadersInit {
  const requestOrigin = request.headers.get("origin");
  const configuredOrigin = env.ALLOWED_ORIGIN?.trim();
  const allowOrigin =
    configuredOrigin && requestOrigin === configuredOrigin
      ? configuredOrigin
      : configuredOrigin
        ? configuredOrigin
        : requestOrigin ?? "*";

  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function jsonResponse(data: unknown, status: number, request: Request, env: Env): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...jsonHeaders,
      ...getCorsHeaders(request, env),
    },
  });
}

function sanitizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function validateSubmission(payload: SubmissionPayload): { data?: SubmissionData; errors?: string[] } {
  const errors: string[] = [];
  const role = sanitizeString(payload.role);

  if (!role || !getRoles().includes(role)) {
    errors.push("A valid role is required.");
  }

  if (!payload.responses || typeof payload.responses !== "object" || Array.isArray(payload.responses)) {
    errors.push("Responses must be an object.");
  }

  if (!payload.declarations || typeof payload.declarations !== "object" || Array.isArray(payload.declarations)) {
    errors.push("Declarations must be an object.");
  }

  if (errors.length > 0) {
    return { errors };
  }

  const responses = payload.responses as Record<string, unknown>;
  const declarations = payload.declarations as Record<string, unknown>;
  const activeFields = getActiveFields(role);
  const requiredDeclarations = getRequiredDeclarations(role);

  for (const field of activeFields) {
    const value = sanitizeString(responses[field.name]);
    const minimum = getMinChars(field, role);

    if (field.required && !value) {
      errors.push(`"${field.label}" is required.`);
      continue;
    }

    if (value && minimum > 0 && value.length < minimum) {
      errors.push(`"${field.label}" must be at least ${minimum} characters.`);
    }

    if (field.link_count && countLinks(value) !== field.link_count) {
      errors.push(`"${field.label}" must include exactly ${field.link_count} links.`);
    }
  }

  for (const declaration of requiredDeclarations) {
    if (declarations[declaration.text] !== true) {
      errors.push(`You must accept: "${declaration.text}"`);
    }
  }

  if (errors.length > 0) {
    return { errors };
  }

  const normalizedResponses: Record<string, string> = {};

  for (const field of activeFields) {
    normalizedResponses[field.name] = sanitizeString(responses[field.name]);
  }

  const normalizedDeclarations: Record<string, boolean> = {};

  for (const declaration of schema.declarations) {
    normalizedDeclarations[declaration.text] = declarations[declaration.text] === true;
  }

  return {
    data: {
      role,
      responses: normalizedResponses,
      declarations: normalizedDeclarations,
      submittedAt: sanitizeString(payload.submittedAt) || null,
      source: sanitizeString(payload.source) || null,
    },
  };
}

function validateSavedDraft(payload: SubmissionPayload): { data?: SubmissionData; errors?: string[] } {
  const errors: string[] = [];
  const role = sanitizeString(payload.role);

  if (!role || !getRoles().includes(role)) {
    errors.push("A valid role is required.");
  }

  if (!payload.responses || typeof payload.responses !== "object" || Array.isArray(payload.responses)) {
    errors.push("Responses must be an object.");
  }

  if (!payload.declarations || typeof payload.declarations !== "object" || Array.isArray(payload.declarations)) {
    errors.push("Declarations must be an object.");
  }

  if (errors.length > 0) {
    return { errors };
  }

  const responses = payload.responses as Record<string, unknown>;
  const declarations = payload.declarations as Record<string, unknown>;
  const normalizedResponses: Record<string, string> = {};
  const normalizedDeclarations: Record<string, boolean> = {};

  for (const field of getActiveFields(role)) {
    normalizedResponses[field.name] = sanitizeString(responses[field.name]);
  }

  for (const declaration of schema.declarations) {
    normalizedDeclarations[declaration.text] = declarations[declaration.text] === true;
  }

  return {
    data: {
      role,
      responses: normalizedResponses,
      declarations: normalizedDeclarations,
      submittedAt: sanitizeString(payload.submittedAt) || null,
      source: sanitizeString(payload.source) || null,
    },
  };
}

function chunkFields(
  fields: Array<{ name: string; value: string; inline?: boolean }>,
  size: number,
): Array<Array<{ name: string; value: string; inline?: boolean }>> {
  const chunks: Array<Array<{ name: string; value: string; inline?: boolean }>> = [];

  for (let index = 0; index < fields.length; index += size) {
    chunks.push(fields.slice(index, index + size));
  }

  return chunks;
}

function buildDiscordPayload(data: SubmissionData, mode: "submit" | "save" = "submit") {
  const activeFields = getActiveFields(data.role);
  const answeredFields = activeFields
    .filter((field) => mode === "submit" || data.responses[field.name])
    .map((field) => {
      const value = data.responses[field.name] || "Not provided";
      const compact = value.length <= 120 && field.type === "text";

      return {
        name: truncate(field.label, 256),
        value: truncate(value || "Not provided", 1024),
        inline: compact,
      };
    });

  const declarationLines = getRequiredDeclarations(data.role)
    .filter((declaration) => data.declarations[declaration.text])
    .map((declaration) => `- ${declaration.text}`);

  const embeds: Array<Record<string, unknown>> = [
    {
      title: `${mode === "save" ? "Saved" : "New"} ${formatRole(data.role)} application`,
      color: getRoleColor(data.role),
      timestamp: new Date().toISOString(),
      fields: [
        {
          name: "Applicant",
          value: truncate(data.responses.name || "Not provided", 1024),
          inline: true,
        },
        {
          name: "Discord",
          value: truncate(data.responses.discord || "Not provided", 1024),
          inline: true,
        },
        {
          name: "Role",
          value: formatRole(data.role),
          inline: true,
        },
      ],
      footer: {
        text: mode === "save" ? "CSMP Application Saves" : "CSMP Applications",
      },
    },
    ...chunkFields(answeredFields, 4).map((fields, index) => ({
      title: `Application Answers ${index + 1}`,
      color: 0x22304a,
      fields,
    })),
  ];

  if (declarationLines.length > 0) {
    embeds.push({
      title: "Accepted declarations",
      color: 0x1f9d6d,
      description: truncate(declarationLines.join("\n"), 4096),
    });
  }

  if (data.source || data.submittedAt) {
    embeds.push({
      title: "Submission details",
      color: 0x8b5cf6,
      fields: [
        {
          name: "Source",
          value: truncate(data.source || "Unknown", 1024),
          inline: false,
        },
        {
          name: "Submitted At",
          value: truncate(data.submittedAt || new Date().toISOString(), 1024),
          inline: false,
        },
      ],
    });
  }

  return {
    username: mode === "save" ? "CSMP Application Saves" : "CSMP Applications",
    embeds: embeds.slice(0, 10),
  };
}

async function postDiscordPayload(webhookUrl: string, payload: unknown): Promise<Response> {
  return fetch(webhookUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request, env),
      });
    }

    if (request.method === "GET" && url.pathname === "/") {
      return jsonResponse(
        {
          service: "csmp-app-backend",
          endpoints: ["GET /", "GET /health", "POST /apply", "POST /save"],
          roles: getRoles(),
        },
        200,
        request,
        env,
      );
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({ ok: true }, 200, request, env);
    }

    if (request.method === "POST" && url.pathname === "/save") {
      let payload: SubmissionPayload;

      try {
        payload = (await request.json()) as SubmissionPayload;
      } catch {
        return jsonResponse({ ok: false, errors: ["Body must be valid JSON."] }, 400, request, env);
      }

      const result = validateSavedDraft(payload);

      if (!result.data) {
        return jsonResponse({ ok: false, errors: result.errors ?? ["Invalid payload."] }, 400, request, env);
      }

      const discordResponse = await postDiscordPayload(saveWebhookUrl, buildDiscordPayload(result.data, "save"));

      if (!discordResponse.ok) {
        const errorText = await discordResponse.text();

        return jsonResponse(
          {
            ok: false,
            errors: [`Discord save webhook failed with ${discordResponse.status}: ${truncate(errorText, 500)}`],
          },
          502,
          request,
          env,
        );
      }

      return jsonResponse({ ok: true, message: "Application saved in this browser and sent to staff." }, 200, request, env);
    }

    if (request.method === "POST" && url.pathname === "/apply") {
      let payload: SubmissionPayload;

      try {
        payload = (await request.json()) as SubmissionPayload;
      } catch {
        return jsonResponse({ ok: false, errors: ["Body must be valid JSON."] }, 400, request, env);
      }

      const result = validateSubmission(payload);

      if (!result.data) {
        return jsonResponse({ ok: false, errors: result.errors ?? ["Invalid payload."] }, 400, request, env);
      }

      const submitPayload = buildDiscordPayload(result.data);
      const [discordResponse, copyDiscordResponse] = await Promise.all([
        postDiscordPayload(officialSubmitWebhookUrl, submitPayload),
        postDiscordPayload(submitCopyWebhookUrl, submitPayload),
      ]);

      if (!discordResponse.ok) {
        const errorText = await discordResponse.text();

        return jsonResponse(
          {
            ok: false,
            errors: [`Discord webhook returned ${discordResponse.status}.`, truncate(errorText, 500)],
          },
          502,
          request,
          env,
        );
      }

      if (!copyDiscordResponse.ok) {
        const errorText = await copyDiscordResponse.text();

        return jsonResponse(
          {
            ok: false,
            errors: [`Discord submit copy webhook failed with ${copyDiscordResponse.status}: ${truncate(errorText, 500)}`],
          },
          502,
          request,
          env,
        );
      }

      return jsonResponse({ ok: true, message: "Application sent successfully." }, 200, request, env);
    }

    return jsonResponse({ ok: false, errors: ["Not found."] }, 404, request, env);
  },
} satisfies ExportedHandler<Env>;
