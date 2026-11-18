export const sortKeysDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (typeof value !== 'object' || value === null) return value;
  let entries: [string, unknown][] = Object.entries(value).map(([key, entryValue]) => [key, sortKeysDeep(entryValue)]);
  entries.sort(([key], [otherKey]) => (key < otherKey ? -1 : 1));
  return Object.fromEntries(entries);
};
export const isSameJsonValue = (value: unknown, otherValue: unknown): boolean => JSON.stringify(sortKeysDeep(value)) === JSON.stringify(sortKeysDeep(otherValue));
