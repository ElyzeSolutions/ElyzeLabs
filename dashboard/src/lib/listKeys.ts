export interface KeyedStringEntry {
  key: string;
  value: string;
}

export function toKeyedNonEmptyStrings(values: readonly string[], prefix: string): KeyedStringEntry[] {
  const counts = new Map<string, number>();

  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => {
      const nextCount = (counts.get(value) ?? 0) + 1;
      counts.set(value, nextCount);

      return {
        key: nextCount === 1 ? `${prefix}:${value}` : `${prefix}:${value}:${nextCount}`,
        value
      };
    });
}

export function buildIndexedKey(prefix: string, value: string | null | undefined, index: number): string {
  const normalized = value?.trim() ?? '';
  return normalized.length > 0 ? `${prefix}:${normalized}:${index}` : `${prefix}:item:${index}`;
}
