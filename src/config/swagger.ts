import fs from 'fs';
import path from 'path';

// The OpenAPI document is hand-maintained at docs/openapi.json as the single
// source of truth (kept in sync with the actual implemented routes) rather
// than generated from JSDoc comments, so what Swagger UI shows is guaranteed
// to match reality.
export function loadOpenApiDocument(): Record<string, unknown> {
  const filePath = path.resolve(__dirname, '..', '..', 'docs', 'openapi.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}
