import { Reveal } from '../components/Reveal';
import { SectionHeader } from '../components/SectionHeader';
import { SourceLink } from '../components/SourceLink';
import {
  IRSA_DATA_PRODUCTS_URL,
  IRSA_QR2_DOI_URL,
  IRSA_QR_OVERVIEW_URL,
  IRSA_SPHEREX_URL,
  SNAPSHOT_RETRIEVED_ON,
} from '../data/irsaSnapshot';
import {
  JPL_SPHEREX,
  JPL_SPHEREX_KIT,
  NASA_ATMOSPHERE,
  NASA_FACT_SHEET,
  NASA_HUBBLE_ORBIT,
  NASA_INFRARED,
  NASA_ISS_FACTS,
  NASA_ISS_ORBIT,
  NASA_ORBITS,
  NASA_PLANET_X,
} from '../content/sources';
import { useCardGlow } from '../hooks/useCardGlow';

const WORKFLOW = [
  { title: 'Select a sky position and date range', text: 'Enter coordinates and the period you are interested in.' },
  { title: 'Prepare chronological images', text: 'Choose a release and wavelength selection, then load real images with UTC observing times.' },
  { title: 'Explore changes over time', text: 'Play, blink or compare frames. Add optional Gaia/WISE context, composites or diagnostic spectra.' },
  { title: 'Inspect metadata and sources', text: 'Check identifiers, wavelength, processing and follow the links to the archive.' },
];

const LIMITS = [
  'A visible difference does not by itself prove movement.',
  'Wavelength, calibration, processing, noise and image settings can all change how an image looks.',
  'An empty result does not prove that nothing exists at a location.',
  'AegisEarth displays archive images and diagnostic evidence. It does not claim to have discovered Planet X or any new object.',
];

const EDUCATION_SOURCES = [
  { group: 'Satellites and space stations', links: [
    { label: 'NASA: ISS facts and figures', url: NASA_ISS_FACTS.url },
    { label: 'NASA: ISS orbit tutorial', url: NASA_ISS_ORBIT.url },
    { label: 'NASA: Hubble orbit', url: NASA_HUBBLE_ORBIT.url },
    { label: 'NASA/JPL: SPHEREx mission', url: JPL_SPHEREX.url },
    { label: 'NASA/JPL: SPHEREx mission overview', url: JPL_SPHEREX_KIT.url },
    { label: 'NASA Earthdata: orbits', url: NASA_ORBITS.url },
  ] },
  { group: 'Earth\u2019s atmosphere', links: [{ label: 'NASA: Earth\u2019s atmosphere, a multi-layered cake', url: NASA_ATMOSPHERE.url }] },
  { group: 'Solar System', links: [
    { label: 'NASA: Planetary Fact Sheet', url: NASA_FACT_SHEET.url },
    { label: 'NASA: Is Planet X real?', url: NASA_PLANET_X.url },
    { label: 'NASA: infrared waves', url: NASA_INFRARED.url },
  ] },
];

// "2026-10-19" -> "19 October 2026"
function longDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function AboutPage() {
  useCardGlow();

  return (
    <>
      <section className="page-hero" aria-labelledby="about-title">
        <div className="wrap">
          <p className="eyebrow">About &amp; Sources</p>
          <h1 id="about-title">Explore astronomical observations with context.</h1>
          <p className="lead">
            AegisEarth is an independent student project by Team Infraq Stargazers at CUET, Chattogram, Bangladesh. It
            was built for the NASA Space Apps Challenge 2026 challenge &ldquo;Planet X and SPHEREx&rdquo;: a public web
            tool for seeing how the sky changes over time in SPHEREx images.
          </p>
          <p className="lead">
            Every observation in the Explorer links back to the NASA/IPAC archive, and every educational fact links to
            the NASA page it comes from.
          </p>
        </div>
      </section>

      <div className="wrap">
        <Reveal>
          <SectionHeader eyebrow="Why it exists" title="The problem and our approach" />
          <p className="prose">
            Astronomical observation files are made for specialists. Someone new to the field can struggle to find the
            right records, to compare two of them fairly, and to know what a difference between them really means.
            AegisEarth puts those steps in one place, with the context needed to read the result.
          </p>
          <ol className="pipeline" aria-label="How to use AegisEarth">
            {WORKFLOW.map((step, i) => (
              <li key={step.title}>
                <span className="pipe-n" aria-hidden="true">{i + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </Reveal>

        <Reveal>
          <SectionHeader eyebrow="Where data comes from" title="Sources and attribution" />
          <div className="cg">
            <article className="panel">
              <h3>NASA/IPAC Infrared Science Archive (IRSA)</h3>
              <p className="prose-sm">
                IRSA hosts the SPHEREx data. The live viewer queries the backend&rsquo;s registered QR2/QR3 collections,
                including their wide and deep products. Each frame retains its source release, observing time,
                preparation details and archive links. Dataset credits travel with the view and exports.
              </p>
              <ul className="srclinks">
                <li><SourceLink href={IRSA_SPHEREX_URL} label="SPHEREx at IRSA" /></li>
                <li><SourceLink href={IRSA_QR_OVERVIEW_URL} label="Quick Release overview and acknowledgement" /></li>
                <li><SourceLink href={IRSA_QR2_DOI_URL} label="Quick Release 2 dataset (DOI 10.26131/IRSA652)" /></li>
                <li><SourceLink href={IRSA_DATA_PRODUCTS_URL} label="SPHEREx data products guide" /></li>
              </ul>
              <p className="note">
                Live queries are bounded archive samples and can be incomplete or temporarily unavailable. The separately
                selected saved-record explorer retains its IRSA metadata snapshot from {longDate(SNAPSHOT_RETRIEVED_ON)};
                it is not a replacement for missing live movie frames.
              </p>
            </article>
            <article className="panel">
              <h3>NASA educational sources</h3>
              <p className="prose-sm">
                The orbit, atmosphere and Solar System facts in the Explorer and Learn pages are taken from these
                official pages. Each value links to its own source.
              </p>
              {EDUCATION_SOURCES.map((group) => (
                <div key={group.group}>
                  <p className="srclinks-title">{group.group}</p>
                  <ul className="srclinks">
                    {group.links.map((link) => (
                      <li key={link.url}><SourceLink href={link.url} label={link.label} /></li>
                    ))}
                  </ul>
                </div>
              ))}
            </article>
          </div>
        </Reveal>

        <Reveal>
          <SectionHeader eyebrow="Traceability" title="Metadata you can inspect" />
          <p className="prose">
            For each observation the Explorer shows the product file, observation ID, planning period, detector, band and
            wavelength range, processing version and date, and the source record. These let anyone check where an image
            came from and how it was prepared. Anything a source does not publish is shown as Not available, never filled
            in.
          </p>
        </Reveal>

        <Reveal>
          <div className="limits">
            <h2>What AegisEarth does not claim</h2>
            <ul>
              {LIMITS.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </Reveal>

        <Reveal>
          <SectionHeader eyebrow="Who made it" title="Team and repository" />
          <div className="cg">
            <article className="panel">
              <h3>Team Infraq Stargazers</h3>
              <p className="prose-sm">CUET, Chattogram, Bangladesh. Team members are listed on the team&rsquo;s NASA Space Apps page.</p>
              <p><SourceLink href="https://www.spaceappschallenge.org/2026/find-a-team/infraq-stargazers/" label="Team page" /></p>
            </article>
            <article className="panel">
              <h3>Source code</h3>
              <p className="prose-sm">The project is developed in the open in a public repository.</p>
              <p><SourceLink href="https://github.com/Ahiraf/AegisEarth" label="github.com/Ahiraf/AegisEarth" /></p>
            </article>
          </div>
        </Reveal>

        <Reveal>
          <figure className="independence">
            <blockquote>
              AegisEarth is an independent student project by Team Infraq Stargazers. It is not affiliated with or endorsed by NASA.
            </blockquote>
          </figure>
        </Reveal>

        <nav className="links" aria-label="Next steps">
          <a href="#/">Explore observations {'\u2192'}</a>
          <a href="#/learn">Learn how to read observations {'\u2192'}</a>
        </nav>
      </div>
    </>
  );
}
