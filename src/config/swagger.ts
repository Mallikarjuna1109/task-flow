import fs from 'fs';
import path from 'path';

export function loadOpenApiDocument(): Record<string, unknown> {
  const filePath = path.resolve(__dirname, '..', '..', 'docs', 'openapi.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}
