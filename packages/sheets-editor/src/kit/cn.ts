import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const TOKEN_STEPS = ['xs', 'sm', 'md', 'lg', 'xl'];

const mergeClasses = extendTailwindMerge({
  extend: {
    theme: {
      spacing: [...TOKEN_STEPS, ...TOKEN_STEPS.map((step) => `pad-${step}`), ...TOKEN_STEPS.map((step) => `gap-${step}`)],
      text: ['caption', 'footnote', 'body', 'body-medium', 'body-semibold', 'heading'],
      radius: ['control', 'panel', 'chip'],
    },
    classGroups: {
      h: [{ h: ['control', 'control-nested'] }],
      'min-h': [{ 'min-h': ['control'] }],
      size: [{ size: ['control', 'control-nested', 'icon'] }],
    },
  },
});

/** Joins class names; a later class wins over an earlier one that sets the same thing. */
export function cn(...values: ClassValue[]): string {
  return mergeClasses(clsx(values));
}
