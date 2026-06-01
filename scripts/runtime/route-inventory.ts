import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import ts from 'typescript';

export interface RouteInventoryEntry {
  method: string;
  path: string;
  area: string;
  public: boolean;
  documented: boolean;
  line: number;
  sourceFile: string;
}

export interface RouteInventoryCoverage {
  documentedRoutes: number;
  undocumentedRoutes: number;
  docOnlyRoutes: string[];
}

export interface RouteInventory {
  schema: 'ops.route-inventory.v1';
  sourceFile: string;
  sourceHash: string;
  docsFile: string;
  totalRoutes: number;
  methods: Record<string, number>;
  areas: Record<string, number>;
  coverage: RouteInventoryCoverage;
  routes: RouteInventoryEntry[];
}

interface BuildRouteInventoryInput {
  sourceText: string;
  sourceFilePath: string;
  docsText: string;
  docsFilePath: string;
}

const HTTP_METHODS = new Set<string>(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
const PUBLIC_API_PREFIXES = [
  '/api/hello',
  '/api/health/readiness',
  '/api/capabilities',
  '/api/openapi',
  '/api/docs',
  '/api/ingress/telegram',
  '/api/telegram/webhook'
];

function routeKey(method: string, routePath: string): string {
  return `${method.toUpperCase()} ${routePath}`;
}

function increment(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1;
}

function normalizeRoutePath(routePath: string): string {
  const queryStart = routePath.indexOf('?');
  return queryStart >= 0 ? routePath.slice(0, queryStart) : routePath;
}

function literalText(node: ts.Node | undefined): string | null {
  if (!node) {
    return null;
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function routeArea(routePath: string): string {
  const segments = routePath.split('/').filter(Boolean);
  if (segments.length === 0) {
    return 'root';
  }
  if (segments[0] !== 'api') {
    return segments[0] ?? 'root';
  }
  return segments[1] ?? 'api';
}

function isPublicRoute(routePath: string): boolean {
  if (!routePath.startsWith('/api/')) {
    return true;
  }
  return PUBLIC_API_PREFIXES.some((prefix) => routePath === prefix || routePath.startsWith(`${prefix}/`));
}

export function extractDocumentedRouteKeys(markdown: string): Set<string> {
  const keys = new Set<string>();
  const expression = /`(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+([^`?\s]+)(?:\?[^`]*)?`/gi;
  let match = expression.exec(markdown);
  while (match) {
    const method = match[1];
    const routePath = match[2];
    if (method && routePath && routePath.startsWith('/')) {
      keys.add(routeKey(method, normalizeRoutePath(routePath)));
    }
    match = expression.exec(markdown);
  }
  return keys;
}

export function extractFastifyRoutes(sourceText: string, sourceFilePath: string, documentedRouteKeys: Set<string>): RouteInventoryEntry[] {
  const sourceFile = ts.createSourceFile(sourceFilePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const routes: RouteInventoryEntry[] = [];
  const relativeSourceFile = path.relative(process.cwd(), sourceFilePath);

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === 'app') {
        const methodName = expression.name.text;
        if (HTTP_METHODS.has(methodName)) {
          const routePath = literalText(node.arguments[0]);
          if (routePath) {
            const method = methodName.toUpperCase();
            const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
            routes.push({
              method,
              path: routePath,
              area: routeArea(routePath),
              public: isPublicRoute(routePath),
              documented: documentedRouteKeys.has(routeKey(method, routePath)),
              line: position.line + 1,
              sourceFile: relativeSourceFile
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return routes;
}

export function buildRouteInventory(input: BuildRouteInventoryInput): RouteInventory {
  const documentedRouteKeys = extractDocumentedRouteKeys(input.docsText);
  const routes = extractFastifyRoutes(input.sourceText, input.sourceFilePath, documentedRouteKeys);
  const routeKeys = new Set(routes.map((route) => routeKey(route.method, route.path)));
  const methods: Record<string, number> = {};
  const areas: Record<string, number> = {};
  for (const route of routes) {
    increment(methods, route.method);
    increment(areas, route.area);
  }
  const documentedRoutes = routes.filter((route) => route.documented).length;
  const docOnlyRoutes = Array.from(documentedRouteKeys)
    .filter((key) => !routeKeys.has(key))
    .sort();

  return {
    schema: 'ops.route-inventory.v1',
    sourceFile: path.relative(process.cwd(), input.sourceFilePath),
    sourceHash: createHash('sha256').update(input.sourceText).digest('hex'),
    docsFile: path.relative(process.cwd(), input.docsFilePath),
    totalRoutes: routes.length,
    methods,
    areas,
    coverage: {
      documentedRoutes,
      undocumentedRoutes: routes.length - documentedRoutes,
      docOnlyRoutes
    },
    routes
  };
}

export function renderRouteInventoryMarkdown(inventory: RouteInventory): string {
  const areaRows = Object.entries(inventory.areas)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([area, count]) => `| ${area} | ${count} |`)
    .join('\n');
  const methodRows = Object.entries(inventory.methods)
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([method, count]) => `| ${method} | ${count} |`)
    .join('\n');
  const routeRows = inventory.routes
    .map((route) =>
      `| ${route.method} | \`${route.path}\` | ${route.area} | ${route.public ? 'yes' : 'no'} | ${route.documented ? 'yes' : 'no'} | ${route.sourceFile}:${route.line} |`
    )
    .join('\n');
  const docOnlyRows =
    inventory.coverage.docOnlyRoutes.length > 0
      ? inventory.coverage.docOnlyRoutes.map((key) => `- \`${key}\``).join('\n')
      : '- None';

  return [
    '# API Route Inventory',
    '',
    'Generated from `packages/gateway/src/server.ts` by `pnpm api:inventory`.',
    '',
    '## Summary',
    '',
    `- Schema: \`${inventory.schema}\``,
    `- Source hash: \`${inventory.sourceHash}\``,
    `- Total routes: ${inventory.totalRoutes}`,
    `- Documented routes: ${inventory.coverage.documentedRoutes}`,
    `- Undocumented routes: ${inventory.coverage.undocumentedRoutes}`,
    '',
    '## Methods',
    '',
    '| Method | Count |',
    '| --- | ---: |',
    methodRows,
    '',
    '## Areas',
    '',
    '| Area | Count |',
    '| --- | ---: |',
    areaRows,
    '',
    '## Documentation-Only Routes',
    '',
    docOnlyRows,
    '',
    '## Routes',
    '',
    '| Method | Path | Area | Public | Documented | Source |',
    '| --- | --- | --- | --- | --- | --- |',
    routeRows,
    ''
  ].join('\n');
}

function stableJson(value: RouteInventory): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeIfChanged(filePath: string, content: string): boolean {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (existing === content) {
    return false;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}

function readInventory(root: string): RouteInventory {
  const sourceFilePath = path.join(root, 'packages/gateway/src/server.ts');
  const docsFilePath = path.join(root, 'docs/api-contract.md');
  return buildRouteInventory({
    sourceText: fs.readFileSync(sourceFilePath, 'utf8'),
    sourceFilePath,
    docsText: fs.readFileSync(docsFilePath, 'utf8'),
    docsFilePath
  });
}

function main(): void {
  const root = process.cwd();
  const inventory = readInventory(root);
  const jsonPath = path.join(root, 'docs/generated/api-route-inventory.json');
  const markdownPath = path.join(root, 'docs/generated/api-route-inventory.md');
  const nextJson = stableJson(inventory);
  const nextMarkdown = renderRouteInventoryMarkdown(inventory);
  const args = new Set(process.argv.slice(2));

  if (args.has('--check')) {
    const currentJson = fs.existsSync(jsonPath) ? fs.readFileSync(jsonPath, 'utf8') : '';
    const currentMarkdown = fs.existsSync(markdownPath) ? fs.readFileSync(markdownPath, 'utf8') : '';
    if (currentJson !== nextJson || currentMarkdown !== nextMarkdown) {
      console.error('API route inventory is stale. Run `pnpm api:inventory`.');
      process.exitCode = 1;
      return;
    }
    console.log(`API route inventory is current (${inventory.totalRoutes} routes).`);
    return;
  }

  if (args.has('--write')) {
    const wroteJson = writeIfChanged(jsonPath, nextJson);
    const wroteMarkdown = writeIfChanged(markdownPath, nextMarkdown);
    console.log(
      `API route inventory ${wroteJson || wroteMarkdown ? 'updated' : 'unchanged'} (${inventory.totalRoutes} routes, ${inventory.coverage.undocumentedRoutes} undocumented).`
    );
    return;
  }

  console.log(
    `API route inventory: ${inventory.totalRoutes} routes, ${inventory.coverage.documentedRoutes} documented, ${inventory.coverage.undocumentedRoutes} undocumented.`
  );
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entrypoint) {
  main();
}
