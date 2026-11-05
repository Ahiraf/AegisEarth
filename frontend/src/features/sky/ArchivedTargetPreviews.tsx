const targets = [
  ["barnards-star", "Barnard’s Star"],
  ["epsilon-indi-b", "Epsilon Indi B"],
  ["wise-0855", "WISE 0855"],
  ["rw-aurigae", "RW Aurigae"],
  ["r-draconis", "R Draconis"],
] as const;

export function ArchivedTargetPreviews() {
  return (
    <details className="sky-details">
      <summary>Archived previews for the five challenge targets</summary>
      <p className="note">
        These SPHEREx contact sheets were saved during the 1 November 2026
        validation run. They remain available if live search is down. The panels
        show recorded observing times and coverage. Use them to inspect the sky
        fields and their quality flags.
      </p>
      <ul>
        {targets.map(([slug, name]) => (
          <li key={slug}>
            <a
              className="srclink"
              href={`${import.meta.env.BASE_URL}archived-targets/2026-11-01/${slug}.png`}
            >
              {name} contact sheet
            </a>
            {" · "}
            <a
              className="srclink"
              href={`https://github.com/Ahiraf/AegisEarth/blob/main/docs/verification/targets/${slug}.json`}
            >
              {name} provenance
            </a>
          </li>
        ))}
      </ul>
      <p className="note">
        Image credit: NASA/IPAC Infrared Science Archive and the SPHEREx
        mission.
      </p>
    </details>
  );
}
