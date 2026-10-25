import { SPHEREX_BANDS } from '../data/irsaSnapshot';

type BandChartProps = {
  /** Band number (1-6) to highlight, or null to show all six equally. */
  band: number | null;
};

const MIN = 0.75;
const MAX = 5.0;
const LEFT = 18;
const WIDTH = 484;
const x = (micron: number) => LEFT + ((micron - MIN) / (MAX - MIN)) * WIDTH;

// SPHEREx's six bands on a wavelength axis, as defined by IRSA. Not an image of the sky.
export function BandChart({ band }: BandChartProps) {
  const chosen = SPHEREX_BANDS.find((b) => b.band === band) ?? null;
  const label = chosen
    ? `SPHEREx bands on a wavelength axis from 0.75 to 5.00 micrometres. Band ${chosen.band}, ${chosen.minMicron.toFixed(2)} to ${chosen.maxMicron.toFixed(2)} micrometres, is highlighted.`
    : 'SPHEREx\u2019s six bands on a wavelength axis from 0.75 to 5.00 micrometres.';
  return (
    <svg className="bandchart" viewBox="0 0 520 118" role="img" aria-label={label}>
      {SPHEREX_BANDS.map((b) => {
        const on = chosen?.band === b.band;
        const left = x(b.minMicron);
        const width = x(b.maxMicron) - left;
        return (
          <g key={b.band}>
            <rect x={left} y="34" width={width} height="30" rx="3" className={on ? 'band band-on' : 'band'} />
            <text x={left + width / 2} y="54" textAnchor="middle" className={on ? 'band-num band-num-on' : 'band-num'}>
              {b.band}
            </text>
          </g>
        );
      })}
      {[1, 2, 3, 4, 5].map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1="70" y2="76" className="band-tick" />
          <text x={x(t)} y="92" textAnchor="middle" className="band-axis">{t}</text>
        </g>
      ))}
      <text x={LEFT + WIDTH / 2} y="112" textAnchor="middle" className="band-axis">Wavelength (micrometres)</text>
      {chosen ? (
        <text x={Math.min(Math.max((x(chosen.minMicron) + x(chosen.maxMicron)) / 2, 70), 450)} y="24" textAnchor="middle" className="band-label">
          Band {chosen.band}: {chosen.minMicron.toFixed(2)}{'\u2013'}{chosen.maxMicron.toFixed(2)} {'\u00b5'}m
        </text>
      ) : null}
    </svg>
  );
}
