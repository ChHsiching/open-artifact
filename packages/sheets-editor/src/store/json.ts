type NotARecord = readonly unknown[] | string | number | boolean | bigint | symbol | null | undefined;

export const isRecord = <T>(value: T): value is Exclude<T, NotARecord> & Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isUint32 = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0 && Number(value) < 4294967296;

export const asArrayOrEmpty = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
