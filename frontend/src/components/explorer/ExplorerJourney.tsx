/** A reading guide, not three fictional workflow buttons. */
interface ExplorerJourneyProps {
  hasObservations: boolean;
  hasMovie: boolean;
  onArchive: () => void;
  onExample: () => void;
  onChoose: () => void;
  onObservations: () => void;
  onMovie: () => void;
}

export function ExplorerJourney({
  hasObservations,
  hasMovie,
  onArchive,
  onExample,
  onChoose,
  onObservations,
  onMovie,
}: ExplorerJourneyProps) {
  return (
    <section
      className="explorer-journey"
      aria-labelledby="explorer-journey-title"
    >
      <div className="explorer-journey-head">
        <div>
          <p className="explorer-kicker">YOUR EXPLORATION PATH</p>
          <h2 id="explorer-journey-title">
            From a sky position to a story across time.
          </h2>
          <p className="explorer-journey-lead">
            Start with a location in the sky. Check which observations exist,
            then explore images through time. You can also prepare a movie
            directly without searching first.
          </p>
          <div className="tb">
            <button className="btn btn-p" onClick={onExample} aria-haspopup="dialog">Try a guided example</button>
            <button className="btn btn-s" onClick={onChoose}>Search by coordinates</button>
          </div>
        </div>
        <div className="explorer-archive-entry">
          <span className="explorer-archive-label">
            ALREADY HAVE AN ARCHIVED FIELD?
          </span>
          <button type="button" className="btn btn-s" onClick={onArchive}>
            Browse saved archive records
          </button>
        </div>
      </div>

      <ol
        className="explorer-steps"
        aria-label="How to explore SPHEREx observations"
      >
        <li className="explorer-step explorer-step-first">
          <div className="explorer-step-top">
            <span className="explorer-step-number" aria-hidden="true">
              01
            </span>
            <span className="explorer-step-type">SELECT A FIELD</span>
          </div>
          <h3>Choose a sky position</h3>
          <p>Enter coordinates or select a target.</p>
          <button
            type="button"
            className="explorer-step-link"
            onClick={onChoose}
          >
            Go to sky position <span aria-hidden="true">↗</span>
          </button>
        </li>
        <li className="explorer-step">
          <div className="explorer-step-top">
            <span className="explorer-step-number" aria-hidden="true">
              02
            </span>
            <span className="explorer-step-type">DISCOVER DATA</span>
          </div>
          <h3>Review observations</h3>
          <p>Search archive records to see what was observed.</p>
          <button
            type="button"
            className="explorer-step-link"
            onClick={onObservations}
          >
            {hasObservations
              ? "View observation records"
              : "Go to observation section"}
            <span aria-hidden="true">↗</span>
          </button>
        </li>
        <li className="explorer-step">
          <div className="explorer-step-top">
            <span className="explorer-step-number" aria-hidden="true">
              03
            </span>
            <span className="explorer-step-type">EXPLORE TIME</span>
          </div>
          <h3>Play a sky movie</h3>
          <p>Prepare images to compare changes over time.</p>
          <button
            type="button"
            className="explorer-step-link"
            onClick={onMovie}
          >
            {hasMovie ? "Open prepared movie" : "Go to movie section"}
            <span aria-hidden="true">↗</span>
          </button>
        </li>
      </ol>
    </section>
  );
}
