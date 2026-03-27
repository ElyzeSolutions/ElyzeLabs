import fsSync from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export interface RepoPatternMatch {
  file: string;
  line: number;
  excerpt: string;
}

interface FindRepoPatternMatchesInput {
  repoPath: string;
  patterns: string[];
  maxMatches: number;
  ignoredGlobs?: string[];
  ignoredDirectoryNames?: string[];
}

const MAX_FALLBACK_FILE_BYTES = 1_000_000;
const DEFAULT_IGNORED_DIRECTORY_NAMES = ['node_modules', '.git', 'dist', 'coverage', 'build', '.next'];
const searchableFileCache = new Map<string, string[]>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const buildCacheKey = (repoPath: string, ignoredDirectoryNames: string[]): string =>
  `${repoPath}::${ignoredDirectoryNames.join('|')}`;

const listSearchableRepoFiles = (repoPath: string, ignoredDirectoryNames: string[]): string[] => {
  const cacheKey = buildCacheKey(repoPath, ignoredDirectoryNames);
  const cached = searchableFileCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const ignored = new Set(ignoredDirectoryNames);
  const files: string[] = [];
  const stack = [repoPath];
  while (stack.length > 0) {
    const currentPath = stack.pop();
    if (!currentPath) {
      continue;
    }
    let stat: fsSync.Stats;
    try {
      stat = fsSync.statSync(currentPath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      let entries: fsSync.Dirent[];
      try {
        entries = fsSync.readdirSync(currentPath, { withFileTypes: true });
      } catch {
        continue;
      }
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries.slice().reverse()) {
        if (ignored.has(entry.name)) {
          continue;
        }
        stack.push(path.join(currentPath, entry.name));
      }
      continue;
    }
    if (!stat.isFile() || stat.size > MAX_FALLBACK_FILE_BYTES) {
      continue;
    }
    files.push(currentPath);
  }

  searchableFileCache.set(cacheKey, files);
  return files;
};

const readFallbackMatches = (input: {
  repoPath: string;
  patterns: string[];
  maxMatches: number;
  ignoredDirectoryNames: string[];
}): RepoPatternMatch[] => {
  if (input.patterns.length === 0 || input.maxMatches <= 0) {
    return [];
  }

  const matches: RepoPatternMatch[] = [];
  const searchableFiles = listSearchableRepoFiles(input.repoPath, input.ignoredDirectoryNames);
  for (const filePath of searchableFiles) {
    if (matches.length >= input.maxMatches) {
      break;
    }
    let content = '';
    try {
      content = fsSync.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    if (content.includes('\u0000')) {
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const matched = input.patterns.some((pattern) => line.includes(pattern));
      if (!matched) {
        continue;
      }
      matches.push({
        file: filePath,
        line: index + 1,
        excerpt: line.trim()
      });
      if (matches.length >= input.maxMatches) {
        break;
      }
    }
  }
  return matches;
};

const readRipgrepMatches = (input: FindRepoPatternMatchesInput): RepoPatternMatch[] | null => {
  const rgResult = spawnSync(
    'rg',
    [
      '--json',
      '--no-heading',
      '--line-number',
      '--max-count',
      String(input.maxMatches),
      ...(input.ignoredGlobs ?? []),
      ...input.patterns.flatMap((pattern) => ['-e', pattern]),
      input.repoPath
    ],
    {
      encoding: 'utf8'
    }
  );
  if (rgResult.error) {
    return null;
  }
  if (rgResult.status !== 0 && !String(rgResult.stdout ?? '').trim()) {
    return [];
  }

  const matches: RepoPatternMatch[] = [];
  const lines = String(rgResult.stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(line);
    } catch {
      parsed = null;
    }
    if (!isRecord(parsed) || parsed.type !== 'match' || !isRecord(parsed.data)) {
      continue;
    }
    const file = isRecord(parsed.data.path) && typeof parsed.data.path.text === 'string' ? parsed.data.path.text : null;
    const lineNumber = typeof parsed.data.line_number === 'number' ? parsed.data.line_number : null;
    const excerpt = isRecord(parsed.data.lines) && typeof parsed.data.lines.text === 'string' ? parsed.data.lines.text.trim() : '';
    if (!file || lineNumber === null) {
      continue;
    }
    matches.push({
      file,
      line: lineNumber,
      excerpt
    });
    if (matches.length >= input.maxMatches) {
      break;
    }
  }
  return matches;
};

export const findRepoPatternMatches = (input: FindRepoPatternMatchesInput): RepoPatternMatch[] => {
  if (!fsSync.existsSync(input.repoPath) || input.patterns.length === 0 || input.maxMatches <= 0) {
    return [];
  }
  const ignoredDirectoryNames =
    input.ignoredDirectoryNames && input.ignoredDirectoryNames.length > 0
      ? input.ignoredDirectoryNames
      : DEFAULT_IGNORED_DIRECTORY_NAMES;
  const ripgrepMatches = readRipgrepMatches(input);
  if (ripgrepMatches !== null) {
    return ripgrepMatches;
  }
  return readFallbackMatches({
    repoPath: input.repoPath,
    patterns: input.patterns,
    maxMatches: input.maxMatches,
    ignoredDirectoryNames
  });
};
