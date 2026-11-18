/** The small pictures on the remix format cards, one per format. */

import type { ReactNode } from 'react';

type Tone = 'sheet' | 'stage' | 'dim' | 'soft' | 'strong' | 'key' | 'light';

const FILLS: Record<Tone, string> = {
  sheet: 'fill-chrome stroke-chrome-line',
  stage: 'fill-chrome-fg/80',
  dim: 'fill-chrome-fg/15',
  soft: 'fill-chrome-accent/35',
  strong: 'fill-chrome-fg/35',
  key: 'fill-chrome-accent',
  light: 'fill-chrome',
};

function Rect({ tone, x, y, width, height, radius = 4 }: { tone: Tone; x: number; y: number; width: number; height: number; radius?: number }): ReactNode {
  return <rect className={FILLS[tone]} x={x} y={y} width={width} height={height} rx={radius} />;
}

const POINTER_PATH = 'M1.5 1.5L1.5 12.5L4.6 9.8L6.9 14.3L8.9 13.4L6.7 9L11 9Z';

function Pointer({ x, y, agent = false }: { x: number; y: number; agent?: boolean }): ReactNode {
  return (
    <g transform={`translate(${x} ${y}) scale(1.3) translate(-1.5 -1.5)`}>
      <path d={POINTER_PATH} className={agent ? 'fill-chrome-accent stroke-chrome' : 'fill-chrome-fg stroke-chrome'} strokeWidth={1.2} strokeLinejoin="round" />
    </g>
  );
}

const PICTURES: Record<string, ReactNode> = {
  dashboard: (
    <>
      <Rect tone="sheet" x={38.5} y={26.5} width={75} height={93} radius={8} />
      <Rect tone="sheet" x={120.5} y={26.5} width={53} height={43} radius={8} />
      <Rect tone="sheet" x={120.5} y={76.5} width={53} height={43} radius={8} />
      <Rect tone="dim" x={49} y={37} width={26} height={4} radius={2} />
      <Rect tone="soft" x={49} y={84} width={14} height={24} />
      <Rect tone="strong" x={69} y={70} width={14} height={38} />
      <Rect tone="key" x={89} y={52} width={14} height={56} />
      <Rect tone="dim" x={131} y={37} width={18} height={4} radius={2} />
      <Rect tone="strong" x={131} y={46} width={31} height={12} />
      <Rect tone="dim" x={131} y={87} width={24} height={4} radius={2} />
      <Rect tone="strong" x={131} y={96} width={21} height={12} />
    </>
  ),
  'visual-analysis': (
    <>
      <Rect tone="sheet" x={58.5} y={16.5} width={95} height={113} radius={8} />
      <path className="fill-chrome-accent/10" d="M71 87C88 87 96 58 117 58C128 58 133 68 141 70V89Q141 93 137 93H75Q71 93 71 89Z" />
      <path className="fill-none stroke-chrome-accent" strokeWidth={2} strokeLinecap="round" d="M71 87C88 87 96 58 117 58C128 58 133 68 141 70" />
      <Rect tone="strong" x={71} y={101} width={46} height={7} radius={3.5} />
      <Rect tone="dim" x={71} y={113} width={70} height={7} radius={3.5} />
      <circle className="fill-chrome stroke-chrome-accent" strokeWidth={2} cx={117} cy={58} r={5.5} />
      <path className="fill-chrome-accent" d="M102 25H132A7 7 0 0 1 139 32V36A7 7 0 0 1 132 43H122L117 48L112 43H102A7 7 0 0 1 95 36V32A7 7 0 0 1 102 25Z" />
      <Rect tone="light" x={104} y={31.5} width={26} height={5} radius={2.5} />
      <Pointer x={121} y={62} agent />
    </>
  ),
  'scroll-story': (
    <>
      <Rect tone="sheet" x={98.5} y={-10.5} width={69} height={167} radius={8} />
      <Rect tone="strong" x={120} y={-2} width={26} height={8} />
      <Rect tone="soft" x={120} y={13} width={18} height={8} />
      <Rect tone="strong" x={120} y={62} width={26} height={8} />
      <Rect tone="soft" x={120} y={77} width={18} height={8} />
      <Rect tone="strong" x={120} y={126} width={26} height={8} />
      <Rect tone="key" x={153} y={88} width={8} height={40} />
      <Rect tone="sheet" x={42.5} y={29.5} width={70} height={87} radius={8} />
      <path className="fill-none stroke-chrome-fg/30" strokeWidth={1} d="M53.5 44.5v57" />
      <Rect tone="key" x={59} y={45} width={18} height={14} />
      <Rect tone="key" x={59} y={66} width={30} height={14} />
      <Rect tone="key" x={59} y={87} width={43} height={14} />
      <Pointer x={150} y={100} />
    </>
  ),
  'visual-short': (
    <>
      <Rect tone="stage" x={34} y={32} width={144} height={81} radius={8} />
      <g className="opacity-40" transform="translate(0 90) scale(1 -1)">
        <Rect tone="light" x={50} y={0} width={12} height={14} />
        <Rect tone="light" x={75} y={0} width={12} height={22} />
        <Rect tone="light" x={125} y={0} width={12} height={27} />
        <Rect tone="light" x={150} y={0} width={12} height={36} />
      </g>
      <circle className="fill-chrome" cx={106} cy={64} r={16} />
      <path
        className="fill-chrome-fg/80"
        transform="translate(90 48) scale(2)"
        d="M7.373 3.5C6.426 2.9 5.953 2.6 5.561 2.63C5.22 2.65 4.907 2.82 4.702 3.1C4.467 3.41 4.467 3.97 4.467 5.1L4.467 10.93C4.467 12.03 4.467 12.59 4.698 12.9C4.9 13.17 5.209 13.34 5.546 13.37C5.934 13.41 6.404 13.12 7.344 12.54L12 9.68C12.858 9.16 13.285 8.9 13.433 8.56C13.563 8.26 13.566 7.93 13.442 7.63C13.299 7.29 12.877 7.02 12.034 6.48L7.373 3.5Z"
      />
      <Rect tone="light" x={48} y={101} width={36} height={4} radius={2} />
      <Rect tone="light" x={88} y={101} width={36} height={4} radius={2} />
      <Rect tone="light" x={128} y={101} width={36} height={4} radius={2} />
    </>
  ),
};

/** The picture for a format key (`dashboard`, `visual-analysis`, `scroll-story`, `visual-short`); empty for others. */
export function FormPicture({ form, className }: { form: string; className?: string }): ReactNode {
  return (
    <svg data-picture={form} viewBox="0 0 212 146" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className={className}>
      {PICTURES[form] ?? null}
    </svg>
  );
}
