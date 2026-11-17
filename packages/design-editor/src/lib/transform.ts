/**
 * Flipping an element through its inline `transform`.
 *
 * Only transforms of the shape `translate… rotate… scale…` (in that order)
 * are understood. A flip negates the scale on that axis and the rotation
 * (a mirrored `rotate(θ)` is `rotate(-θ)` mirrored), so flipping twice gives
 * back the original transform.
 */

/** The parts of an editable transform. */
export interface TransformParts {
  /** Translate lengths as written (`0` when absent). */
  tx: string;
  ty: string;
  /** Rotation in degrees. */
  rotate: number;
  sx: number;
  sy: number;
}

const IDENTITY: TransformParts = { tx: '0', ty: '0', rotate: 0, sx: 1, sy: 1 };

const FUNCTION = /([a-zA-Z]+)\(([^()]*)\)/g;

/** An angle in degrees, or `null` when it is not a plain angle. */
function angle(text: string): number | null {
  const match = /^(-?\d*\.?\d+(?:e-?\d+)?)(deg|rad|turn|grad)?$/i.exec(text.trim());
  if (!match) return null;
  const value = Number(match[1]);
  switch ((match[2] ?? '').toLowerCase()) {
    case 'rad':
      return (value * 180) / Math.PI;
    case 'turn':
      return value * 360;
    case 'grad':
      return value * 0.9;
    case '':
      return value === 0 ? 0 : null;
    default:
      return value;
  }
}

const isLength = (text: string) => /^-?\d*\.?\d+(?:e-?\d+)?([a-z%]+)?$/i.test(text.trim());
const isNumber = (text: string) => /^-?\d*\.?\d+(?:e-?\d+)?$/.test(text.trim());

/** Parses an inline transform; `null` when it has anything else in it. */
export function parseTransform(text: string): TransformParts | null {
  const value = text.trim();
  if (!value || value === 'none') return { ...IDENTITY };
  if (value.replace(FUNCTION, '').trim() !== '') return null;
  const parts = { ...IDENTITY };
  let phase = 0;
  for (const match of value.matchAll(FUNCTION)) {
    const name = match[1]!.toLowerCase();
    const args = match[2]!.split(',').map((arg) => arg.trim());
    const order = name.startsWith('translate') ? 0 : name === 'rotate' || name === 'rotatez' ? 1 : name.startsWith('scale') ? 2 : -1;
    if (order < phase) return null;
    phase = order;
    switch (name) {
      case 'translate':
        if (args.length > 2 || !args.every(isLength)) return null;
        parts.tx = args[0]!;
        parts.ty = args[1] ?? '0';
        break;
      case 'translatex':
        if (args.length !== 1 || !isLength(args[0]!)) return null;
        parts.tx = args[0]!;
        break;
      case 'translatey':
        if (args.length !== 1 || !isLength(args[0]!)) return null;
        parts.ty = args[0]!;
        break;
      case 'rotate':
      case 'rotatez': {
        const deg = args.length === 1 ? angle(args[0]!) : null;
        if (deg === null) return null;
        parts.rotate += deg;
        break;
      }
      case 'scale':
        if (args.length > 2 || !args.every(isNumber)) return null;
        parts.sx *= Number(args[0]);
        parts.sy *= Number(args[1] ?? args[0]);
        break;
      case 'scalex':
        if (args.length !== 1 || !isNumber(args[0]!)) return null;
        parts.sx *= Number(args[0]);
        break;
      case 'scaley':
        if (args.length !== 1 || !isNumber(args[0]!)) return null;
        parts.sy *= Number(args[0]);
        break;
      default:
        return null;
    }
  }
  return parts;
}

const num = (value: number) => String(Math.round(value * 1000) / 1000);
const zero = (length: string) => /^-?0*\.?0+([a-z%]+)?$/i.test(length.trim());

/** Writes transform parts back; `''` for the identity. */
export function serializeTransform(parts: TransformParts): string {
  const out: string[] = [];
  const tx = zero(parts.tx);
  const ty = zero(parts.ty);
  if (!tx && !ty) out.push(`translate(${parts.tx}, ${parts.ty})`);
  else if (!tx) out.push(`translateX(${parts.tx})`);
  else if (!ty) out.push(`translateY(${parts.ty})`);
  const rotate = ((parts.rotate % 360) + 360) % 360;
  if (Math.abs(rotate) > 1e-6 && Math.abs(rotate - 360) > 1e-6) out.push(`rotate(${num(parts.rotate)}deg)`);
  if (parts.sx === parts.sy) {
    if (parts.sx !== 1) out.push(`scale(${num(parts.sx)})`);
  } else if (parts.sy === 1) out.push(`scaleX(${num(parts.sx)})`);
  else if (parts.sx === 1) out.push(`scaleY(${num(parts.sy)})`);
  else out.push(`scale(${num(parts.sx)}, ${num(parts.sy)})`);
  return out.join(' ');
}

/** The transform flipped on an axis; `null` when the transform is not editable. */
export function flipTransform(text: string, axis: 'x' | 'y'): string | null {
  const parts = parseTransform(text);
  if (!parts) return null;
  return serializeTransform({
    ...parts,
    rotate: -parts.rotate,
    sx: axis === 'x' ? -parts.sx : parts.sx,
    sy: axis === 'y' ? -parts.sy : parts.sy,
  });
}
