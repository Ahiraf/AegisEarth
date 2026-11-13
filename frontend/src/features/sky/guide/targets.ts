import saved from "../../../archive/targetVisitSamples.json";
import previews from "../../../archive/previews.json";
import { M101, SPHEREX_BANDS } from "../../../data/irsaSnapshot";
import type { Target } from "../types";

export const pinwheel: Target = {
  slug: "m101",
  name: "Pinwheel Galaxy (M101)",
  ra_deg: M101.raDeg,
  dec_deg: M101.decDeg,
};

export const pinwheelBand = SPHEREX_BANDS[1]; // D2 in the earliest saved M101 preview.

// Saved coordinates and sampled UTC days from docs/verification/targets/<slug>.json.
// Live catalog coordinates take priority when available.
export const guideFields = [
  ...saved,
  {
    target: pinwheel,
    sampleWavelength: null,
    dates: [
      ...new Set(
        previews.previews
          .filter(
            (p) =>
              p.center_icrs_deg[0] === M101.raDeg &&
              p.center_icrs_deg[1] === M101.decDeg,
          )
          .map((p) => p.observed_at_utc.slice(0, 10)),
      ),
    ].sort(),
  },
];

export const subjects = {
  "barnards-star": {
    kind: "Nearby red dwarf",
    question: "Can a star change its place in the sky?",
    text: "Barnard’s Star is a small, cool star close to our Sun. Over years we can see it slide against more distant stars. Astronomers call this proper motion.",
    watch:
      "Watch the red star travel past the fixed background points. Its motion is sped up here. In a short movie the shift may be too small to see.",
    source:
      "https://exoplanetarchive.ipac.caltech.edu/cgi-bin/DisplayOverview/nph-DisplayOverview?objname=Barnard",
  },
  "epsilon-indi-b": {
    kind: "Two brown dwarfs",
    question: "Can two objects look like one dot?",
    text: "Epsilon Indi B is a pair of brown dwarfs called Ba and Bb. A brown dwarf forms like a star but has too little mass to keep turning hydrogen into helium in its core.",
    watch:
      "Follow the two bodies around their shared center. The model separates them so you can see the pair. Their light can blend together in a telescope image.",
    source: "https://doi.org/10.1051/0004-6361/200912981",
  },
  "wise-0855": {
    kind: "Very cold brown dwarf",
    question: "How do you look for an object this faint?",
    text: "WISE 0855 is a nearby brown dwarf so cool that it gives off very little visible light. Infrared telescopes can pick up some of the energy it emits.",
    watch:
      "The rings represent infrared light leaving the dwarf. In the viewer, check which wavelengths were recorded. A frame covering its position can still be too noisy to reveal it.",
    source:
      "https://www.jpl.nasa.gov/images/pia18002-cold-and-quick-a-fast-moving-brown-dwarf/",
  },
  "rw-aurigae": {
    kind: "Young star system",
    question: "What can make a young star fade?",
    text: "RW Aurigae contains a young star surrounded by gas and dust. Material crossing our line of sight can block some of its light.",
    watch:
      "Watch dust pass in front of the star. Compare visits at similar wavelengths to investigate dimming. This model shows one possible cause.",
    source:
      "https://www.nasa.gov/universe/chandra-may-have-first-evidence-of-a-young-star-devouring-a-planet/",
  },
  "r-draconis": {
    kind: "Pulsating giant star",
    question: "Can brightness change while position stays the same?",
    text: "R Draconis is a Mira variable, a giant star that expands and contracts. Its light changes over a cycle.",
    watch:
      "Watch the star swell and fade around the same center. In real frames it looks like a point. Compare its brightness with nearby stars using the same display scale.",
    source: "https://simbad.cds.unistra.fr/simbad/sim-id?Ident=R+Dra",
  },
  m101: {
    kind: "Spiral galaxy",
    question: "What if the target fills the picture?",
    text: "The Pinwheel Galaxy is a vast collection of stars, gas, and dust. We see its spiral arms almost face-on. A small sky field captures only part of it.",
    watch:
      "Turn the disk to see its spiral shape. A wider field includes more of the galaxy. The model turns for inspection; its arms will look still between telescope visits.",
    source: "https://science.nasa.gov/asset/hubble/spitzer-image-of-m101/",
  },
} as const;

export type Subject = keyof typeof subjects;
export type GuideScene = Subject | "spherex";

export function targetWidth(target: Target): number {
  return Math.max(
    Math.abs(target.pm_ra_cosdec_mas_yr ?? 0),
    Math.abs(target.pm_dec_mas_yr ?? 0),
  ) > 1000
    ? 10
    : 5;
}
