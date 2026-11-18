import type { Dataset } from '@open-artifact/data-core';

/** A dataset patch without a `title` or `description` that would not change them. */
export function getChangedMetadataPatch<T extends { title?: string; description?: string }>(patch: T, dataset: Pick<Dataset, 'title' | 'description'>): Partial<T> {
  const { title, description, ...rest } = patch;
  return {
    ...(title === undefined || title === dataset.title ? {} : { title }),
    ...(description === undefined || description === dataset.description ? {} : { description }),
    ...rest,
  } as Partial<T>;
}
