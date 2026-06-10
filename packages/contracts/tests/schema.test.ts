import { describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import path from 'path';

describe('Phase 2 contract schemas', () => {
  test('scan-result schema includes structured report', async () => {
    const schema = await readSchema('scan-result.schema.json');
    expect(schema.required).toContain('report');
    expect(schema.$defs.report.required).toEqual(['id', 'scope', 'startedAt', 'finishedAt', 'success', 'summary', 'issues', 'screenshots', 'warnings']);
    expect(schema.$defs.issue.properties.kind.enum).toEqual(['overlap', 'overflow', 'contrast', 'color_harmony', 'crawler', 'api', 'auth_required', 'auth_failed']);
    expect(schema.$defs.report.properties.colorAnalysis.$ref).toBe('#/$defs/colorAnalysis');
  });

  test('cache-diff schema exposes four buckets and affected routes', async () => {
    const schema = await readSchema('cache-diff.schema.json');
    expect(schema.required).toEqual(['changed', 'unchanged', 'unknown', 'deleted', 'affectedRoutes']);
  });

  test('scan-action schema accepts Phase 2 scopes', async () => {
    const schema = await readSchema('scan-action.schema.json');
    expect(schema.properties.scope.enum).toEqual(['changed', 'all', 'route']);
  });
});

async function readSchema(fileName: string) {
  const schemaPath = path.join(import.meta.dir, '..', 'schemas', fileName);
  return JSON.parse(await fs.readFile(schemaPath, 'utf8'));
}
