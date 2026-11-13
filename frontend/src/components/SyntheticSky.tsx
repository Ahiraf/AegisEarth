import { useId, useMemo } from 'react';
import { makeBlobs, makeSpecks, makeStars } from '../lib/syntheticSky';

const W = 640;
const H = 400;

type SyntheticSkyProps = {
  /** Same field seed = same star pattern. */
  fieldSeed: number;
  noiseSeed: number;
  tint: string;
  gain: number;
  label?: string;
  animated?: boolean;
};

// Planet X exercises identify the simulation in their captions.
export function SyntheticSky({ fieldSeed, noiseSeed, tint, gain, label, animated = false }: SyntheticSkyProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const stars = useMemo(() => makeStars(fieldSeed, 130, W, H), [fieldSeed]);
  const blobs = useMemo(() => makeBlobs(fieldSeed, W, H), [fieldSeed]);
  const specks = useMemo(() => makeSpecks(noiseSeed, 150, W, H), [noiseSeed]);
  const g = Math.max(0.2, gain);

  return (
    <svg
      className="synthetic-sky"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label ?? 'Illustration of a star field, not a SPHEREx image.'}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id={`${uid}-blob`}>
          <stop offset="0" stopColor={tint} stopOpacity="0.6" />
          <stop offset="1" stopColor={tint} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-glow`}>
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#07121f" />
          <stop offset="1" stopColor="#030810" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${uid}-bg)`} />
      {blobs.map((b, i) => (
        <ellipse
          key={`b${i}`}
          cx={b.cx}
          cy={b.cy}
          rx={b.rx}
          ry={b.ry}
          transform={`rotate(${b.rot} ${b.cx} ${b.cy})`}
          fill={`url(#${uid}-blob)`}
          opacity={Math.min(1, b.o * g * 2.2)}
        />
      ))}
      {specks.map((s, i) => (
        <rect key={`s${i}`} x={s.x} y={s.y} width={s.s} height={s.s} fill="#9fb4c8" opacity={s.o} />
      ))}
      {stars.map((s, i) => (
        <g key={`t${i}`}>
          {s.bright ? <circle className={animated ? "px-star-glow" : undefined} style={animated ? { animationDelay: `-${(i % 13) * 0.47}s` } : undefined} cx={s.x} cy={s.y} r={s.r * 4} fill={`url(#${uid}-glow)`} opacity={Math.min(1, 0.7 * g)} /> : null}
          <circle cx={s.x} cy={s.y} r={s.r} fill="#e9f1ff" opacity={Math.min(1, s.o * g)} />
        </g>
      ))}
      {!animated && <g transform={`rotate(-18 ${W / 2} ${H / 2})`} className="synthetic-mark" aria-hidden="true">
        <text x={W / 2} y={H / 2 - 70} textAnchor="middle">ILLUSTRATION</text>
        <text x={W / 2} y={H / 2 + 10} textAnchor="middle">ILLUSTRATION</text>
        <text x={W / 2} y={H / 2 + 90} textAnchor="middle">ILLUSTRATION</text>
      </g>}
    </svg>
  );
}
