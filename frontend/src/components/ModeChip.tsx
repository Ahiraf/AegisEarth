import type { DataMode } from '../types/observation';

type ModeChipProps = { mode: DataMode; count?: number };

// A small label that says what kind of records a section shows.
export function ModeChip({ mode, count }: ModeChipProps) {
  if (mode === 'snapshot') {
    return <span className="chip chip-info">{count !== undefined ? `${count} SAVED IRSA RECORDS` : 'SAVED IRSA RECORDS'}</span>;
  }
  return <span className="chip chip-plain">{count !== undefined ? `${count} RECORDS` : 'LIVE DATA'}</span>;
}
