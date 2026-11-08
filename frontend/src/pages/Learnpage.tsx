import { BandChart } from '../components/BandChart';
import { Reveal } from '../components/Reveal';
import { SectionHeader } from '../components/SectionHeader';
import { SourceLink } from '../components/SourceLink';
import { SyntheticSky } from '../components/SyntheticSky';
import { IRSA_DATA_PRODUCTS_URL, IRSA_QR_OVERVIEW_URL } from '../data/irsaSnapshot';
import { FIRST_MOVIE, ORBIT_TERMS, SPECTRAL_OPTIONS, TARGETS, VIEWER_TOOLS } from '../content/learn';
import { JPL_SPHEREX, NASA_ATMOSPHERE, NASA_EMS, NASA_INFRARED, NASA_PLANET_X } from '../content/sources';
import { useCardGlow } from '../hooks/useCardGlow';
import { scrollToId } from '../lib/scroll';

const CHAPTERS = [
  { id: 'first-sky-movie', title: 'Start here' },
  { id: 'sky-coordinates', title: 'Coordinates and field size' },
  { id: 'infrared-light', title: 'Spectral selection' },
  { id: 'comparing-images', title: 'Read the sky movie' },
  { id: 'viewer-tools', title: 'More viewer tools' },
  { id: 'reading-metadata', title: 'Image details' },
  { id: 'orbits-and-planets', title: 'Orbits and planets' },
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
  ['Observed, processed and retrieved', 'Observed is when the telescope collected the light. Processed is when the archive prepared the data. Retrieved is when AegisEarth fetched it. Use the observation time (UTC) to tell when the sky looked that way.'],
  ['Wavelength or band', 'The slice of infrared light the image records. Match wavelengths as closely as possible when checking a brightness change.'],
  ['Coverage and quality flags', 'Coverage shows which part of your field has data. Flags mark pixels that may be affected by stray light, instrument effects or other issues. Masked or blank patches should be treated as missing measurements.'],
  ['Dataset and processing release', 'The archive collection and processing version. QR labels such as QR3 are Quick Releases. Wide covers broad survey areas. Deep covers selected fields with extra observations. A new release can add data or change calibration.'],
  ['Original source record and provenance', 'The archive link and the record of where the image came from and how it was prepared. Use them to trace an image back to its source.'],
  ['Display stretch', 'How the app turns measured values into screen brightness. Shared across time uses the same rule for all frames. Per image adjusts each frame separately, which can make steady sources seem to brighten or dim.'],
];

type GlossaryEntry = { term: string; text: string; source?: { label: string; url: string } };
const GLOSSARY: GlossaryEntry[] = [
  { term: 'Observation', text: 'A record that an instrument made of part of the sky at one moment, in one wavelength range.' },
  { term: 'Wavelength', text: 'The distance between one wave crest of light and the next. It decides what kind of light it is, and is measured here in micrometres (millionths of a metre).', source: { label: 'NASA source', url: NASA_EMS.url } },
  { term: 'Infrared', text: 'Light with wavelengths longer than visible light. Human eyes cannot see it.', source: { label: 'NASA source', url: NASA_INFRARED.url } },
  { term: 'Band', text: 'A range of wavelengths. SPHEREx uses six detector arrays and 102 nominal spectral channels. A selected channel does not guarantee that every observation covers it at your sky position.', source: { label: 'IRSA source', url: IRSA_QR_OVERVIEW_URL } },
  { term: 'Planning period', text: 'A label in SPHEREx product names for a stretch of survey operations of about 3.5 days. It is a survey-plan label, not a calendar date.', source: { label: 'IRSA source', url: IRSA_DATA_PRODUCTS_URL } },
  { term: 'Calibration', text: 'Converting raw instrument readings into meaningful units and removing known instrument effects.' },
  { term: 'Image stretch', text: 'The rule that maps pixel values to brightness on screen. A different stretch can make faint features look stronger or weaker.' },
  { term: 'Observation product', text: 'A data file or record made from an observation, such as a calibrated image, with its own identifier.', source: { label: 'IRSA source', url: IRSA_DATA_PRODUCTS_URL } },
  { term: 'Provenance', text: 'The record of where data came from and what was done to it along the way.' },
  { term: 'Epoch', text: 'A point in time attached to a measurement or catalogue position. Nearby objects may have shifted since the catalogue epoch.' },
  { term: 'Proper motion', text: 'A star or other object’s gradual shift across the sky due to its motion relative to us, as seen against distant background sources.' },
  { term: 'Parallax', text: 'An apparent shift caused by a change in viewpoint. As Earth travels around the Sun, nearby objects appear to shift relative to distant ones. Try holding up a finger and looking at it with one eye, then the other.' },
  { term: 'Variable star', text: 'A star whose observed brightness changes over time. For example, a star can pulse or be periodically blocked by a companion.' },
  { term: 'Brown dwarf', text: 'An object with too little mass to sustain the hydrogen fusion that powers stars like the Sun. Cool brown dwarfs can be easier to find in infrared light.' },
  { term: 'Registration', text: 'Lining up images so that the same sky position lands in the same place in each frame.' },
  { term: 'WCS (World Coordinate System)', text: 'The map that connects pixels in an image to coordinates in the sky.' },
  { term: 'FITS and PNG', text: 'FITS is an astronomy file format that can store measurements and sky coordinates. PNG is the rendered image you see in the browser.' },
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
          <h1 id="learn-title">A beginner’s guide to AegisEarth</h1>
          <p className="lead">
            Start with a patch of sky, turn SPHEREx images into a short movie, and look for points of light that move
            or change brightness. You can use your first target before learning any astronomy terms.
          </p>
          <div className="actions">
            <a className="btn btn-p" href="#/">Open the sky viewer</a>
          </div>
          <nav aria-label="Guide chapters">
            <div className="pills">
              {CHAPTERS.map((chapter) => (
                <button key={chapter.id} type="button" className="pill" onClick={() => scrollToId(chapter.id, true)}>
                  {chapter.title}
                </button>
              ))}
            </div>
          </nav>
        </div>
      </section>

      <div className="wrap guide">
        <Reveal>
          <SectionHeader
            eyebrow="Start here"
            title="Make your first sky movie"
            headingId="first-sky-movie"
            lead="Start with the default galaxy field. You can change any of the settings on your next search."
          />
          <ol className="pipeline" aria-label="Steps to make a sky movie">
            {FIRST_MOVIE.map((step, i) => (
              <li key={step.title}>
                <span className="pipe-n" aria-hidden="true">{i + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
          <details className="guide-detail">
            <summary>What if the movie is empty or takes too long?</summary>
            <p>
              You need at least two usable frames to see changes. If you see only one image or none, clear the dates,
              switch back to Common available wavelengths, or try Native image inspection if the viewer offers it.
              If the progress card says processing exceeded its time limit, try a smaller field or fewer source images.
              If the archive is unavailable, open Archived previews for the five challenge targets in the Explorer
              to see images from earlier runs.
            </p>
          </details>
          <details className="guide-detail">
            <summary>Which challenge target should I try?</summary>
            <p>Use a target button under Find observations. These are things to look for when coverage, dates and image quality allow.</p>
            <dl className="defs">
              {TARGETS.map(([name, description]) => (
                <div key={name}><dt>{name}</dt><dd>{description}</dd></div>
              ))}
            </dl>
          </details>
        </Reveal>

        <Reveal>
          <SectionHeader eyebrow="Choose a place" title="Right ascension, declination and field size" headingId="sky-coordinates" />
          <p className="prose">
            Imagine a map wrapped around the sky. AegisEarth needs two coordinates to find the centre of the patch
            you want, just as a map needs longitude and latitude. The app uses a standard sky map called ICRS.{' '}
            <SourceLink href="https://science.nasa.gov/learn/basics-of-space-flight/chapter2-2/" label="NASA sky coordinates guide" />
          </p>
          <dl className="defs">
            <div>
              <dt>Right ascension (RA)</dt>
              <dd>How far east to go around the sky’s equator from a fixed starting point. A full turn is 360° or 24 hours of RA. One hour of RA equals 15°. The hours describe an angle on the sky.</dd>
            </div>
            <div>
              <dt>Declination (Dec)</dt>
              <dd>How far north or south to go from the sky’s equator. Zero is on the equator, +90° is the north sky pole, and −90° is the south sky pole. Keep the minus sign for a point south of the equator.</dd>
            </div>
            <div>
              <dt>Field of view (FOV)</dt>
              <dd>The width and height of the patch around those coordinates. One degree contains 60 arcminutes. A 5 × 5 arcminute field is a small square. Use a wider field for objects that may drift outside it, or a smaller field for quicker processing.</dd>
            </div>
            <div>
              <dt>Observation start and end</dt>
              <dd>The dates you want to search, in UTC, a standard time used worldwide. Leave both empty to start with available dates. If you use them, enter both and put the earlier date first. The search accepts up to 730 days at a time.</dd>
            </div>
          </dl>
          <aside className="guide-example" aria-labelledby="coordinate-example">
            <h3 id="coordinate-example">Try entering WISE 0855 by hand</h3>
            <p>
              Enter <code>08:55:10.831</code> in Right ascension and <code>-7.245147</code> in Declination.
              The same RA in decimal degrees is about <code>133.795129</code>. Start with a 10 × 10 arcminute
              field so there is room to look around the reference position.
            </p>
          </aside>
        </Reveal>

        <Reveal>
          <SectionHeader eyebrow="What you are viewing" title="What is an observation?" headingId="what-is-an-observation" />
          <p className="prose">
            An observation is a record of light that a telescope collected from part of the sky. Think of each frame
            as a snapshot taken through one part of the infrared spectrum. The same place can have several
            observations from different dates or wavelength ranges.
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
          <SectionHeader eyebrow="Choose which light to see" title="Spectral selection and infrared light" headingId="infrared-light" />
          <p className="prose">
            Spectral selection tells the viewer which range of infrared light to look for. Think of it as choosing a
            filter for the image. A point of light can look brighter through one filter than another, even on the
            same day. Start with common wavelengths when you want to compare dates.
          </p>
          <dl className="defs">
            {SPECTRAL_OPTIONS.map(({ title, text }) => (
              <div key={title}><dt>{title}</dt><dd>{text}</dd></div>
            ))}
          </dl>
          <p className="prose">
            Light is a wave, and its wavelength sets what kind of light it is. Infrared light has longer wavelengths
            than visible light, so our eyes cannot see it.{' '}
            <SourceLink href={NASA_INFRARED.url} label="NASA source" context="infrared light" />
          </p>
          <p className="prose">
            SPHEREx measures 102 channels of near-infrared light across six detector bands. The chart below shows
            their wavelength ranges. The unit μm means micrometre, one millionth of a metre.{' '}
            <SourceLink href={JPL_SPHEREX.url} label="NASA/JPL SPHEREx mission" />{' '}
            <SourceLink href={IRSA_QR_OVERVIEW_URL} label="IRSA wavelength guide" />
          </p>
          <div className="diagrams">
            <figure className="diagram">
              <svg viewBox="0 0 360 172" role="img" aria-label="Two waves: a short-wavelength wave with many crests, and a long-wavelength wave with few crests.">
                <path d={wavePath(340, 60, 8)} transform="translate(10 6)" fill="none" stroke="#4CC3F0" strokeWidth="2.5" />
                <path d={wavePath(340, 60, 3)} transform="translate(10 82)" fill="none" stroke="#F5B942" strokeWidth="2.5" />
                <text x="10" y="166" fill="#B8CADD" fontSize="13">Short wave above, long wave below.</text>
              </svg>
            <figcaption>The spacing between the crests shows the wavelength.</figcaption>
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
                <text x="130" y="100" fill="#E7EDF7" fontSize="13">Infrared (invisible to the eye)</text>
                <text x="10" y="124" fill="#B8CADD" fontSize="12">Wavelength increases to the right {'\u2192'}</text>
              </svg>
              <figcaption>The strip illustrates the order of the wavelengths.</figcaption>
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
            The app turns invisible light into shades you can see. A light pixel shows a stronger signal under the
            current display settings. If an infrared image uses visible colours, the colours are chosen to help you
            tell signals or wavelengths apart.
          </p>
        </Reveal>

        <Reveal>
          <SectionHeader eyebrow="Watch the same place over time" title="Read the sky movie" headingId="comparing-images" />
          <dl className="defs">
            <div>
              <dt>Sky-fixed comparison grid</dt>
              <dd>The app lines up each frame on the same sky map. A steady background star should stay in the same place. Start here to look for motion or brightness changes.</dd>
            </div>
            <div>
              <dt>Native image inspection</dt>
              <dd>See each cutout on the detector’s original pixel grid. The angle, position or coverage of the patch may differ between frames. Use it to inspect a single image or check coverage.</dd>
            </div>
            <div>
              <dt>Sequence, blink and side by side</dt>
              <dd>Sequence plays the frames from oldest to newest. Blink A / B flips between two chosen frames so a shift is easier to spot. Side by side lets you inspect both at your own pace. Use the frame dates to see how much real time passed.</dd>
            </div>
            <div>
              <dt>Shared display stretch</dt>
              <dd>Keeps the screen brightness settings consistent across frames. Pair it with similar wavelengths and good coverage to judge whether one point changed brightness.</dd>
            </div>
          </dl>
          <h3 className="sub-h">Try comparing these practice images</h3>
          <p className="prose">
            Pick a bright point near the middle of the first image and find it in the second. Try the same with
            the points around it. Do their positions change, or do they just look different?
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
          <h3 className="sub-h">Before calling a change real</h3>
          <ul className="checklist">
            {CONSIDERATIONS.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <p className="prose">
            The star pattern stays put in these pictures. Colour, brightness settings and simulated noise make the
            two views look different. In real images, compare nearby points to see whether the whole field shifts or
            just one point does.
          </p>
        </Reveal>

        <Reveal>
          <SectionHeader eyebrow="Check what you see" title="What a difference can mean" headingId="what-a-difference-means" />
          <div className="verdicts">
            <article className="verdict verdict-real">
              <p className="verdict-mark" aria-hidden="true">{'\u25cf'}</p>
              <h3>A possible real astronomical change</h3>
              <p>A nearby object can shift against the background. A variable star can brighten or dim in place. See if the pattern holds across more dates.</p>
            </article>
            <article className="verdict verdict-effect">
              <p className="verdict-mark" aria-hidden="true">{'\u25b2'}</p>
              <h3>A viewing or processing effect</h3>
              <p>A different wavelength or brightness setting can change how a steady object looks. If many points shift together, the images may be slightly misaligned.</p>
            </article>
            <article className="verdict verdict-unsure">
              <p className="verdict-mark" aria-hidden="true">?</p>
              <h3>Not enough information</h3>
              <p>One frame may be missing data where you are looking. Open the coverage and quality details, or try a pair with more overlap.</p>
            </article>
          </div>
        </Reveal>

        <Reveal>
          <SectionHeader
            eyebrow="After your first movie"
            title="More ways to explore"
            headingId="viewer-tools"
            lead="Try these once you have a prepared view. Check the result notes for missing data or limits on the comparison."
          />
          <div className="guide-details">
            {VIEWER_TOOLS.map(({ title, text }) => (
              <details className="guide-detail" key={title}>
                <summary>{title}</summary>
                <p>{text}</p>
              </details>
            ))}
            <details className="guide-detail">
              <summary>Release, display and averaging options</summary>
              <p>
                These search options let you filter the archive release and wavelength range, choose how to show
                brightness, and inspect flagged pixels in native images. Leave Average within at 0 seconds to
                keep observations separate. Averaging nearby observations can make a steady object easier to see
                and blur a moving one.
              </p>
            </details>
          </div>
        </Reveal>

        <Reveal>
          <SectionHeader
            eyebrow="Read the label on each image"
            title="What the image details mean"
            headingId="reading-metadata"
            lead="Metadata is the information that comes with each image. Look under Coordinates, quality and source evidence in the viewer to see where the frame came from."
          />
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
          <SectionHeader eyebrow="Explore our neighbourhood" title="Orbits, planets and Earth’s atmosphere" headingId="orbits-and-planets" />
          <h3 className="sub-h">What keeps something in orbit?</h3>
          <p className="prose">
            An orbit is the path one object follows around another under gravity. Imagine throwing a ball sideways.
            Gravity bends its path downward. A spacecraft moving sideways fast enough keeps falling as Earth’s
            surface curves away below it. Some orbits are nearly round and others are stretched into an oval called
            an ellipse.{' '}
            <SourceLink href="https://science.nasa.gov/learn/basics-of-space-flight/chapter3-4/" label="NASA guide to orbiting" />
          </p>
          <p className="prose">
            Each item in the main navigation opens its own page. In <a className="srclink" href="#/orbits">Satellites &amp; space stations</a>, click a spacecraft or its label, or choose one from the list to see its facts in a side panel.
            Drag the 3D model to turn your view, or use its arrow and zoom buttons. Selecting a mission highlights
            its orbit and opens a summary, source-linked facts and an explanation of its path. The same camera
            controls work with the keyboard: focus the model, then use arrow keys, + / − and Home to reset.
            Choose “Take a closer look” to inspect the spacecraft, then “Overview” to see all the orbits again.
            Close the detail panel with its × button or Escape. On a phone the panel appears at the bottom.
            Read the cards for reference times and distances: heights and animation speeds are compressed, and
            spacecraft sizes are exaggerated. These are illustrative orbits, not live satellite positions.
          </p>
          <h3 className="sub-h">How to read the planet and spacecraft facts</h3>
          <dl className="defs">
            {ORBIT_TERMS.map(([term, definition]) => (
              <div key={term}><dt>{term}</dt><dd>{definition}</dd></div>
            ))}
          </dl>
          <p className="prose">
            <SourceLink href="https://science.nasa.gov/earth/facts/" label="NASA Earth facts" />{' '}
            <SourceLink href="https://science.nasa.gov/earth/earth-observatory/catalog-of-earth-satellite-orbits/" label="NASA satellite orbit guide" />
          </p>
          <h3 className="sub-h">Try the Solar System model</h3>
          <p className="prose">
            In <a className="srclink" href="#/solar">The Solar System in 3D</a>, select Earth, then Mars. Compare their
            diameters to see which planet is wider. Compare their orbital periods to see which year is longer.
            Drag to turn the model and roll the mouse wheel up to zoom in or down to zoom out, without holding Ctrl.
            The + and − buttons also zoom. The model makes the planets bigger and brings them
            closer together so you can see them. Click a planet directly or use the object list to open its description.
            “Take a closer look” brings its textured globe into view. The full-screen button hides the site navigation
            on supported browsers; press Escape or “Exit” to return. The maps use enhanced colours, and the scene does not show current positions.
          </p>
          <p className="prose">
            Planet X, also called Planet Nine, is a proposed planet far beyond Neptune. Its existence remains
            unconfirmed. It is explained in the planet panels rather than drawn as a confirmed ninth planet.{' '}
            <SourceLink href={NASA_PLANET_X.url} label="NASA guide to Planet X" />
          </p>
          <h3 className="sub-h">Where does the atmosphere end?</h3>
          <p className="prose">
            The atmosphere is the layer of gases around Earth. In <a className="srclink" href="#/atmosphere">Layers of Earth’s atmosphere</a>,
            move the altitude slider or enter a height in kilometres. The bright marker travels through the cutaway
            and the guide changes when you enter a different layer. You can also choose a layer by name.
            Try 5 km for the troposphere, 25 km for the ozone-containing stratosphere, 65 km for the mesosphere,
            420 km for the space station’s thermosphere, and 1,500 km for the exosphere.
            The slider uses a compressed height scale to make the low layers easier to explore. Layer thicknesses
            are exaggerated and colours are a key, not a temperature measurement.
            Most weather happens in the troposphere, the lowest layer.
            Higher up, the air gets thinner. Satellites such as the space station can orbit where traces of the
            atmosphere still remain. Layer heights are approximate.{' '}
            <SourceLink href={NASA_ATMOSPHERE.url} label="NASA atmosphere guide" />
          </p>
        </Reveal>

        <Reveal>
          <SectionHeader eyebrow="Look up a word" title="Key terms" headingId="key-terms" />
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
