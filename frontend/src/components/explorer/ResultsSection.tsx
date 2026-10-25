import { formatWavelengthRange, observationName } from '../../lib/format';
import type { DataMode, Observation } from '../../types/observation';
import type { SearchUi, Selection, Slot } from '../../types/ui';
import { Badge } from '../Badge';
import { ModeChip } from '../ModeChip';
import { Notice } from '../Notice';
import { Reveal } from '../Reveal';
import { SectionHeader } from '../SectionHeader';
import { SourceLink } from '../SourceLink';
import { StateMessage } from '../StateMessage';
import { Unavailable } from '../Value';

type ResultsSectionProps = {
  ui: SearchUi;
  mode: DataMode;
  selection: Selection;
  onAssign: (slot: Slot, id: string) => void;
  onRetry: () => void;
  onUseExample: () => void;
};

function SourceBadge({ observation }: { observation: Observation }) {
  return observation.origin === 'saved-snapshot' ? (
    <Badge variant="snapshot">IRSA archive</Badge>
  ) : (
    <Badge variant="status">Live record</Badge>
  );
}

function announcement(ui: SearchUi): string {
  if (ui.phase === 'loading') return 'Searching for observations.';
  if (ui.phase === 'idle') return '';
  const result = ui.result;
  if (result.status === 'ok') {
    const n = result.observations.length;
    return n === 0 ? 'No observations match this search.' : `${n} observation${n === 1 ? '' : 's'} found.`;
  }
  if (result.status === 'not-configured') return 'The data source is not set up.';
  return 'The search failed.';
}

export function ResultsSection({ ui, mode, selection, onAssign, onRetry, onUseExample }: ResultsSectionProps) {
  const result = ui.phase === 'done' ? ui.result : null;
  const observations = result?.status === 'ok' ? result.observations : [];

  let body;
  if (ui.phase === 'idle') {
    body = (
      <StateMessage kind="empty" title="Ready to search">
        <p>Enter a sky position and a date range, then choose Find observations.</p>
      </StateMessage>
    );
  } else if (ui.phase === 'loading') {
    body = (
      <StateMessage kind="loading" title="Searching">
        <p>Looking for matching observations.</p>
      </StateMessage>
    );
  } else if (result?.status === 'not-configured') {
    body = (
      <Notice tone="info" title="Data source not set up">
        <p>{result.message}</p>
      </Notice>
    );
  } else if (result?.status === 'error') {
    body = (
      <StateMessage kind="error" title="The search could not be completed">
        <p>{result.message}</p>
        <button type="button" className="btn btn-s btn-sm" onClick={onRetry}>
          Try again
        </button>
      </StateMessage>
    );
  } else if (observations.length === 0) {
    body = (
      <StateMessage kind="empty" title="No saved records match">
        <p>
          No saved SPHEREx records cover this position in this date range. Try the Pinwheel Galaxy (M101) or widen the
          dates, or search the full archive at IRSA.
        </p>
        <button type="button" className="btn btn-s btn-sm" onClick={onUseExample}>
          Search the Pinwheel Galaxy (M101)
        </button>
      </StateMessage>
    );
  } else {
    body = (
      <>
        <div className="tw" role="region" aria-label="Observation records (scrolls sideways on small screens)" tabIndex={0}>
          <table>
            <caption className="sr-only">
              Observation records. Choose one record as A and one as B to compare them below.
            </caption>
            <thead>
              <tr>
                <th scope="col">Compare as</th>
                <th scope="col">Observation</th>
                <th scope="col">Planning period</th>
                <th scope="col">Band</th>
                <th scope="col">Processed</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {observations.map((o) => {
                const name = observationName(o);
                const range = formatWavelengthRange(o);
                return (
                  <tr
                    key={o.id}
                    className={`${selection.a === o.id ? 'sel-a' : ''} ${selection.b === o.id ? 'sel-b' : ''}`.trim() || undefined}
                  >
                    <td>
                      <div className="pick">
                        <label>
                          <input
                            type="radio"
                            name="slot-a"
                            checked={selection.a === o.id}
                            onChange={() => onAssign('a', o.id)}
                            aria-label={`Use ${name} as observation A`}
                          />
                          <span aria-hidden="true">A</span>
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="slot-b"
                            checked={selection.b === o.id}
                            onChange={() => onAssign('b', o.id)}
                            aria-label={`Use ${name} as observation B`}
                          />
                          <span aria-hidden="true">B</span>
                        </label>
                      </div>
                    </td>
                    <td className="nowrap">
                      <strong className="mono">{name}</strong>
                      <span className="sub">{o.detector !== null ? `Detector ${o.detector}` : 'Detector not available'}</span>
                    </td>
                    <td className="nowrap">{o.planningPeriod ?? <Unavailable />}</td>
                    <td className="nowrap">
                      {o.bandLabel ?? <Unavailable />}
                      <span className="sub">{range ?? 'Range not available'}</span>
                    </td>
                    <td className="nowrap">
                      {o.processedOn ?? <Unavailable />}
                      <span className="sub">{o.provenance.processingRelease ?? 'Version not available'}</span>
                    </td>
                    <td>
                      <SourceBadge observation={o} />
                      {o.provenance.sourceRecordUrl ? (
                        <span className="sub">
                          <SourceLink href={o.provenance.sourceRecordUrl} label="Open product" context={name} />
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {result?.status === 'ok' && result.note ? (
          <p className="note">
            {result.note}
            {result.noteLink ? (
              <>
                {' '}
                <SourceLink href={result.noteLink.url} label={result.noteLink.label} />
              </>
            ) : null}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <Reveal id="results">
      <SectionHeader
        eyebrow="02 / Available records"
        title="Observation results"
        chip={<ModeChip mode={mode} count={result?.status === 'ok' ? observations.length : undefined} />}
      />
      <p className="sr-only" role="status">{announcement(ui)}</p>
      {body}
    </Reveal>
  );
}
