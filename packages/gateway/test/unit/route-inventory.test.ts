import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildRouteInventory,
  renderRouteInventoryMarkdown,
  type RouteInventory
} from '../../../../scripts/runtime/route-inventory.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function routeKey(route: { method: string; path: string }): string {
  return `${route.method} ${route.path}`;
}

function parseGeneratedInventory(value: unknown): RouteInventory {
  expect(isRecord(value)).toBe(true);
  if (!isRecord(value)) {
    throw new Error('generated inventory is not an object');
  }
  expect(value.schema).toBe('ops.route-inventory.v1');
  expect(Array.isArray(value.routes)).toBe(true);
  if (!Array.isArray(value.routes)) {
    throw new Error('generated inventory routes are missing');
  }
  const routes = value.routes.flatMap((route) => {
    if (!isRecord(route) || typeof route.method !== 'string' || typeof route.path !== 'string') {
      return [];
    }
    return [{ method: route.method, path: route.path }];
  });
  return {
    schema: 'ops.route-inventory.v1',
    sourceFile: typeof value.sourceFile === 'string' ? value.sourceFile : '',
    sourceHash: typeof value.sourceHash === 'string' ? value.sourceHash : '',
    docsFile: typeof value.docsFile === 'string' ? value.docsFile : '',
    totalRoutes: typeof value.totalRoutes === 'number' ? value.totalRoutes : 0,
    methods: {},
    areas: {},
    coverage: {
      documentedRoutes: 0,
      undocumentedRoutes: 0,
      docOnlyRoutes: []
    },
    routes: routes.map((route) => ({
      method: route.method,
      path: route.path,
      area: '',
      public: false,
      documented: false,
      line: 0,
      sourceFile: ''
    }))
  };
}

describe('route inventory', () => {
  it('extracts Fastify routes and keeps the generated docs inventory current', () => {
    const root = process.cwd();
    const sourceFilePath = path.join(root, 'packages/gateway/src/server.ts');
    const docsFilePath = path.join(root, 'docs/api-contract.md');
    const generatedPath = path.join(root, 'docs/generated/api-route-inventory.json');
    const inventory = buildRouteInventory({
      sourceText: fs.readFileSync(sourceFilePath, 'utf8'),
      sourceFilePath,
      docsText: fs.readFileSync(docsFilePath, 'utf8'),
      docsFilePath
    });

    expect(inventory.totalRoutes).toBeGreaterThan(250);
    expect(inventory.routes.some((route) => route.method === 'GET' && route.path === '/api/doctor')).toBe(true);
    expect(inventory.routes.some((route) => route.method === 'POST' && route.path === '/api/memory/remember')).toBe(true);
    expect(inventory.routes.find((route) => route.method === 'POST' && route.path === '/api/ingress/telegram')?.public).toBe(true);
    expect(inventory.routes.find((route) => route.method === 'POST' && route.path === '/api/memory/remember')?.documented).toBe(true);
    expect(renderRouteInventoryMarkdown(inventory)).toContain('Total routes');

    const generated = parseGeneratedInventory(JSON.parse(fs.readFileSync(generatedPath, 'utf8')));
    const currentRouteKeys = inventory.routes.map(routeKey);
    const generatedRouteKeys = generated.routes.map(routeKey);
    expect(generated.sourceHash).toBe(inventory.sourceHash);
    expect(generated.totalRoutes).toBe(inventory.totalRoutes);
    expect(generatedRouteKeys).toEqual(currentRouteKeys);
  }, 20_000);
});
