import { BandChart } from '../components/BandChart';
import { Reveal } from '../components/Reveal';
import { SectionHeader } from '../components/SectionHeader';
import { SourceLink } from '../components/SourceLink';
import { SyntheticSky } from '../components/SyntheticSky';
import { IRSA_DATA_PRODUCTS_URL, IRSA_QR_OVERVIEW_URL } from '../data/irsaSnapshot';
import { JPL_SPHEREX, NASA_EMS, NASA_INFRARED } from '../content/sources';
import { useCardGlow } from '../hooks/useCardGlow';
import { scrollToId } from '../lib/scroll';

const CHAPTERS = [
  { id: 'what-is-an-observation', title: 'What is an observation?' },
  { id: 'infrared-light', title: 'Understanding infrared light' },
  { id: 'comparing-images', title: 'Comparing images across time' },
  { id: 'what-a-difference-means', title: 'What a difference can mean' },
  { id: 'reading-metadata', title: 'Reading observation metadata' },
  { id: 'key-terms', title: 'Key terms' },
];

const PIPELINE = [
  { title: 'Sky region', text: 'The part of the sky you care about, described by its coordinates.' },
  { title: 'Instrument observation', text: 'A telescope and detector record light from that region at one moment.' },
  { title: 'Processed image', text: 'Raw measurements are calibrated and turned into an image you can view.' },
  { title: 'Associated metadata', text: 'Identifiers, times, wavelength and processing details say what the image is.' },
];

const CONSIDERATIONS = [
  'Do both observations cover the same region of the sky?',
  'When were they taken, and which time system do the timestamps use?',
  'Which wavelength or band does each one record?',
  'Were they calibrated and processed in the same way?',
  'Were they displayed with the same image stretch and settings?',
  'Which source record and identifier does each come from?',
];

const METADATA = [
  ['Product or observation identifier', 'A label that points to exactly one record, so anyone can find the same data again.'],
  ['Observation time and time basis', 'When the observation was made, and which time system (such as UTC) the timestamp uses. Without the time basis, times cannot be compared reliably.'],
  ['Wavelength or band', 'Which slice of light the image records. Images from different bands are not directly comparable.'],
  ['Dataset and processing release', 'The data collection and the version of the processing pipeline. A new release can change how an image looks.'],
  ['Original source record', 'A link to the provider\u2019s own page for this record. It is the authority if anything disagrees.'],
  ['Retrieval time', 'When AegisEarth fetched the information. Provider data can be revised after that moment.'],
  ['Image rendering and display settings', 'How pixel values were turned into what you see: the stretch, the colour mapping and similar choices.'],
];

type GlossaryEntry = { term: string; text: string; source?: { label: string; url: string } };
const GLOSSARY: GlossaryEntry[] = [
  { term: 'Observation', text: 'A record that an instrument made of part of the sky at one moment, in one wavelength range.' },
  { term: 'Wavelength', text: 'The distance between one wave crest of light and the next. It decides what kind of light it is, and is measured here in micrometres (millionths of a metre).', source: { label: 'NASA source', url: NASA_EMS.url } },
  { term: 'Infrared', text: 'Light with wavelengths longer than visible light. Human eyes cannot see it.', source: { label: 'NASA source', url: NASA_INFRARED.url } },
  { term: 'Band', text: 'A range of wavelengths. SPHEREx records six bands, one for each of its six detectors.', source: { label: 'IRSA source', url: IRSA_QR_OVERVIEW_URL } },
  { term: 'Planning period', text: 'A label in SPHEREx product names for a stretch of survey operations of about 3.5 days. It is a survey-plan label, not a calendar date.', source: { label: 'IRSA source', url: IRSA_DATA_PRODUCTS_URL } },
  { term: 'Calibration', text: 'Converting raw instrument readings into meaningful units and removing known instrument effects.' },
  { term: 'Image stretch', text: 'The rule that maps pixel values to brightness on screen. A different stretch can make faint features look stronger or weaker.' },
  { term: 'Observation product', text: 'A data file or record made from an observation, such as a calibrated image, with its own identifier.', source: { label: 'IRSA source', url: IRSA_DATA_PRODUCTS_URL } },
  { term: 'Provenance', text: 'The record of where data came from and what was done to it along the way.' },
];

// Draws a sine wave as an SVG path (used for the "short vs long wavelength" picture).
function wavePath(width: number, height: number, cycles: number): string {
  const amplitude = height * 0.34;
  let d = '';
  for (let i = 0; i <= 160; i += 1) {
    const x = (i / 160) * width;
    const y = height / 2 - amplitude * Math.sin((i / 160) * cycles * Math.PI * 2);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

export function LearnPage() {
  useCardGlow();

  return (
    <>
      <section className="page-hero" aria-labelledby="learn-title">
        <div className="wrap">
          <p className="eyebrow">Learn</p>
          <h1 id="learn-title">Learn to read the changing sky.</h1>
          <p className="lead">
            An astronomical image is not a photograph of the sky as your eyes would see it. It is an observation, shaped
            by the instrument that made it, the wavelength it recorded, and the calibration and processing steps behind
            it. This short guide explains how to read one carefully.
          </p>
          <div className="actions">
            <a className="btn btn-p" href="#/">Explore observations</a>
          </div>
          <nav aria-label="Guide chapters">
            <div className="pills">
              {CHAPTERS.map((chapter, i) => (
                <button key={chapter.id} type="button" className="pill" onClick={() => scrollToId(chapter.id, true)}>
                  {i + 1}. {chapter.title}
                </button>
              ))}
            </div>
          </nav>
        </div>
      </section>

      <div className="wrap guide">
        <Reveal>
          <SectionHeader eyebrow="Chapter 1" title="What is an observation?" headingId="what-is-an-observation" />
          <p className="prose">
            A star, a comet or a patch of sky exists whether or not anyone looks at it. An observation is the record an
            instrument made of it at one moment. The same region can produce many observations: at different times, in
            different wavelengths, with different settings. Learning to tell the sky from the record is the first step.
          </p>
          <ol className="pipeline" aria-label="From the sky to a record">
            {PIPELINE.map((step, i) => (
              <li key={step.title}>
                <span className="pipe-n" aria-hidden="true">{i + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </Reveal>

        <Reveal>
          <SectionHeader eyebrow="Chapter 2" title="Understanding infrared light" headingId="infrared-light" />
          <p className="prose">
            Light is a wave, and its wavelength sets what kind of light it is. Infrared light has longer wavelengths
            than visible light, so our eyes cannot see it.{' '}
            <SourceLink href={NASA_INFRARED.url} label="NASA source" context="infrared light" />
          </p>
          <p className="prose">
            SPHEREx, launched in March 2025, surveys the entire sky every six months in 102 colour bands of
            near-infrared light.{' '}
            <SourceLink href={JPL_SPHEREX.url} label="NASA/JPL source" context="the SPHEREx survey" /> IRSA
            describes its spectroscopy as covering 0.75 to 5 micrometres, split across six detectors and bands.{' '}
            <SourceLink href={IRSA_QR_OVERVIEW_URL} label="IRSA source" context="the SPHEREx wavelength range" />
          </p>
          <div className="diagrams">
            <figure className="diagram">
              <svg viewBox="0 0 360 172" role="img" aria-label="Two waves: a short-wavelength wave with many crests, and a long-wavelength wave with few crests.">
                <path d={wavePath(340, 60, 8)} transform="translate(10 6)" fill="none" stroke="#4CC3F0" strokeWidth="2.5" />
                <path d={wavePath(340, 60, 3)} transform="translate(10 82)" fill="none" stroke="#F5B942" strokeWidth="2.5" />
                <text x="10" y="166" fill="#B8CADD" fontSize="13">Top: short wavelength. Bottom: long wavelength.</text>
              </svg>
              <figcaption>Conceptual diagram, not to scale.</figcaption>
            </figure>
            <figure className="diagram">
              <svg viewBox="0 0 360 150" role="img" aria-label="A strip showing the colours of visible light on the left, followed by infrared on the right, with wavelength increasing to the right.">
                <defs>
                  <linearGradient id="learn-visible" x1="0" x2="1">
                    <stop offset="0" stopColor="#7b3fe4" />
                    <stop offset="0.25" stopColor="#2f7be0" />
                    <stop offset="0.5" stopColor="#35c27b" />
                    <stop offset="0.75" stopColor="#f2d33b" />
                    <stop offset="1" stopColor="#e0393e" />
                  </linearGradient>
                  <linearGradient id="learn-infrared" x1="0" x2="1">
                    <stop offset="0" stopColor="#8a1f2b" />
                    <stop offset="1" stopColor="#1a0a10" />
                  </linearGradient>
                </defs>
                <rect x="10" y="30" width="110" height="46" rx="4" fill="url(#learn-visible)" />
                <rect x="120" y="30" width="230" height="46" rx="4" fill="url(#learn-infrared)" stroke="#6A8AA6" strokeDasharray="5 4" />
                <text x="10" y="100" fill="#E7EDF7" fontSize="13">Visible light</text>
                <text x="130" y="100" fill="#E7EDF7" fontSize="13">Infrared: invisible to the eye</text>
                <text x="10" y="124" fill="#B8CADD" fontSize="12">Wavelength increases to the right {'\u2192'}</text>
              </svg>
              <figcaption>Conceptual diagram, not to scale.</figcaption>
            </figure>
          </div>
          <figure className="diagram diagram-wide">
            <BandChart band={null} />
            <figcaption>
              SPHEREx&rsquo;s six bands on a wavelength axis, as defined by IRSA.{' '}
              <SourceLink href={IRSA_QR_OVERVIEW_URL} label="IRSA source" context="the SPHEREx bands" />
            </figcaption>
          </figure>
          <p className="prose">
            Because infrared light is invisible, infrared images have no natural colours. Viewers show them in
            grayscale, or assign visible colours to different wavelengths (false colour). A colour on screen is a choice
            made by whoever prepared the image. It does not tell you what an object would look like to your eyes.
          </p>
        </Reveal>

        <Reveal>
          <SectionHeader eyebrow="Chapter 3" title="Comparing images across time" headingId="comparing-images" />
          <p className="prose">
            Comparing two observations of the same place is how changes are noticed. It only works if the two are
            comparable. These two generated illustrations show the idea: the same star pattern, drawn with different settings.
          </p>
          <div className="cg">
            <figure className="panel illus">
              <div className="prev"><SyntheticSky fieldSeed={7} noiseSeed={31} tint="#6ec6ff" gain={1} label="Illustration of a star field, first picture. Not a SPHEREx image." /></div>
              <figcaption>Illustration, not a SPHEREx image. Picture one.</figcaption>
            </figure>
            <figure className="panel illus">
              <div className="prev"><SyntheticSky fieldSeed={7} noiseSeed={77} tint="#e6c07a" gain={0.8} label="Illustration of a star field, second picture. Not a SPHEREx image." /></div>
              <figcaption>Illustration, not a SPHEREx image. Picture two.</figcaption>
            </figure>
          </div>
          <h3 className="sub-h">A careful comparison asks</h3>
          <ul className="checklist">
            {CONSIDERATIONS.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <p className="prose">
            Apparent differences can have several causes, and an image difference is not automatically evidence of
            movement. Here the two pictures look different even though nothing in them moved.
          </p>
        </Reveal>

        <Reveal>
          <SectionHeader eyebrow="Chapter 4" title="What a difference can mean" headingId="what-a-difference-means" />
          <div className="verdicts">
            <article className="verdict verdict-real">
              <p className="verdict-mark" aria-hidden="true">{'\u25cf'}</p>
              <h3>A possible real astronomical change</h3>
              <p>An object may have moved or changed brightness between observations. Comets and asteroids can shift position against the background stars. This is a reason to look closer, not a conclusion.</p>
            </article>
            <article className="verdict verdict-effect">
              <p className="verdict-mark" aria-hidden="true">{'\u25b2'}</p>
              <h3>A viewing or processing effect</h3>
              <p>The images may differ because of wavelength, calibration, noise, image stretch or processing. These differences are common and do not mean anything changed in the sky.</p>
            </article>
            <article className="verdict verdict-unsure">
              <p className="verdict-mark" aria-hidden="true">?</p>
              <h3>Not enough information</h3>
              <p>If the observations cover different regions, use different bands, or lack key metadata, you cannot say which explanation applies. The honest result is uncertain.</p>
            </article>
          </div>
          <p className="prose">AegisEarth does not decide between these for you. It shows the records and their details so you can reason about them.</p>
        </Reveal>

        <Reveal>
          <SectionHeader eyebrow="Chapter 5" title="Reading observation metadata" headingId="reading-metadata" lead="These are the fields the Explorer shows for each observation, and why each one matters. IRSA defines the SPHEREx fields in its archive guide." />
          <p className="prose">
            <SourceLink href={IRSA_DATA_PRODUCTS_URL} label="IRSA data products guide" />
          </p>
          <dl className="defs">
            {METADATA.map(([term, text]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        </Reveal>

        <Reveal>
          <SectionHeader eyebrow="Chapter 6" title="Key terms" headingId="key-terms" />
          <dl className="defs">
            {GLOSSARY.map((entry) => (
              <div key={entry.term}>
                <dt>{entry.term}</dt>
                <dd>
                  {entry.text}
                  {entry.source ? (
                    <>
                      {' '}
                      <SourceLink href={entry.source.url} label={entry.source.label} context={entry.term} />
                    </>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>

        <nav className="links" aria-label="Next steps">
          <a href="#/">Explore observations {'\u2192'}</a>
          <a href="#/about">About &amp; Sources {'\u2192'}</a>
        </nav>
      </div>
    </>
  );
}
