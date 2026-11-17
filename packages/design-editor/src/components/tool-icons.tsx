






import type { ReactNode, SVGProps } from 'react';

function Glyph({ children, ...rest }: SVGProps<SVGSVGElement> & { children: ReactNode }): ReactNode {
  return (
    <svg
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-5 shrink-0"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Select: an arrow pointing up and left. */
export const CursorIcon = (): ReactNode => (
  <Glyph>
    <path d="M4.5 4.5 16 9.2l-5 1.8-1.8 5L4.5 4.5Z" />
  </Glyph>
);

/** Text: a plain T. */
export const TextIcon = (): ReactNode => (
  <Glyph>
    <path d="M4.75 4.75h10.5M10 4.75v10.5" />
  </Glyph>
);

/** Artboard: an upright #. */
export const FrameIcon = (): ReactNode => (
  <Glyph>
    <path d="M7.5 3.75v12.5M12.5 3.75v12.5M3.75 7.5h12.5M3.75 12.5h12.5" />
  </Glyph>
);

/** Note: a square whose lower right corner is folded up. */
export const NoteIcon = (): ReactNode => (
  <Glyph>
    <path d="M10.75 16.25h-4.5a2.5 2.5 0 0 1-2.5-2.5v-7.5a2.5 2.5 0 0 1 2.5-2.5h7.5a2.5 2.5 0 0 1 2.5 2.5v4.5l-5.5 5.5Z" />
    <path d="M10.75 16.25v-2.5a2.5 2.5 0 0 1 2.5-2.5h3" />
  </Glyph>
);

/** Pencil: solid, with its cap cut off. */
export const PencilIcon = (): ReactNode => (
  <Glyph fill="currentColor" stroke="none">
    <path d="m13.3 4.6.9-.9a1.9 1.9 0 0 1 2.7 2.7l-.9.9-2.7-2.7Z" />
    <path d="m12.4 5.5 2.7 2.7-7.5 7.5a1.6 1.6 0 0 1-.7.4l-2.7.7a.6.6 0 0 1-.7-.7l.7-2.7a1.6 1.6 0 0 1 .4-.7l7.8-7.4Z" />
  </Glyph>
);

/** Rectangle: a square with rounded corners. */
export const RectIcon = (): ReactNode => (
  <Glyph>
    <rect x="4.25" y="4.25" width="11.5" height="11.5" rx="1.75" />
  </Glyph>
);

/** Oval. */
export const OvalIcon = (): ReactNode => (
  <Glyph>
    <circle cx="10" cy="10" r="6" />
  </Glyph>
);

/** Arrow: a line with an open head, up and right. */
export const ArrowIcon = (): ReactNode => (
  <Glyph>
    <path d="M4.75 15.25 15.25 4.75M8.5 4.75h6.75v6.75" />
  </Glyph>
);

/** Line. */
export const LineIcon = (): ReactNode => (
  <Glyph>
    <path d="M4.75 15.25 15.25 4.75" />
  </Glyph>
);
