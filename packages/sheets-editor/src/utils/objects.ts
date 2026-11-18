export const isNonNullObject = (value: unknown): value is Record<PropertyKey, any> => typeof value === 'object' && value !== null;
