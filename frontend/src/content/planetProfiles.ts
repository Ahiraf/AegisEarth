/**
 * Editorial context for the existing Solar System profiles. These descriptions
 * are educational facts, never generated orbital telemetry or live data.
 * Moon totals are taken from PLANETS (NASA's confirmed counts as of Aug 2026).
 * Rotation durations are approximate sidereal rotation times (not solar days).
 * References: https://science.nasa.gov/solar-system/planets/
 *             https://spaceplace.nasa.gov/days/en/
 */
export type PlanetProfile = {
  classification: string;
  rotation: string;
  rotationDescription: string;
  featureTitle: string;
  featureDescription: string;
  moonDescription: string;
  notableMoons?: string;
  moonSourceUrl: string;
};

export const PLANET_PROFILES: Record<string, PlanetProfile> = {
  mercury: {
    classification: "Terrestrial planet",
    rotation: "≈59 Earth days",
    rotationDescription: "One spin relative to distant stars",
    featureTitle: "A world built for extremes",
    featureDescription:
      "Mercury has a heavily cratered rocky surface and almost no atmosphere to hold heat. It completes its orbit around the Sun in just 88 Earth days.",
    moonDescription: "No natural moons are currently known to orbit Mercury.",
    moonSourceUrl: "https://science.nasa.gov/mercury/facts/",
  },
  venus: {
    classification: "Terrestrial planet",
    rotation: "≈243 Earth days",
    rotationDescription: "One slow, retrograde spin",
    featureTitle: "A hidden, hostile surface",
    featureDescription:
      "Thick clouds conceal Venus's rocky surface. Its carbon-dioxide-rich atmosphere drives an extreme greenhouse effect, and Venus rotates in the opposite direction from most planets.",
    moonDescription: "Venus has no confirmed natural moons.",
    moonSourceUrl: "https://science.nasa.gov/venus/facts/",
  },
  earth: {
    classification: "Terrestrial planet",
    rotation: "≈23.9 hours",
    rotationDescription: "One spin relative to distant stars",
    featureTitle: "Our ocean world",
    featureDescription:
      "Earth is the only world known to support life. Its liquid oceans, protective atmosphere, and magnetic field shape the environment we inhabit.",
    moonDescription:
      "Our Moon helps stabilize Earth's axial tilt and drives much of the ocean tide cycle.",
    notableMoons: "The Moon",
    moonSourceUrl: "https://science.nasa.gov/moon/facts/",
  },
  mars: {
    classification: "Terrestrial planet",
    rotation: "≈24.6 hours",
    rotationDescription: "One spin relative to distant stars",
    featureTitle: "Clues to an ancient watery past",
    featureDescription:
      "Mars preserves river valleys, sedimentary rock, and evidence that liquid water flowed long ago. Olympus Mons is the largest volcano known in the Solar System.",
    moonDescription:
      "Mars's two small, irregular moons are named Phobos and Deimos.",
    notableMoons: "Phobos · Deimos",
    moonSourceUrl: "https://science.nasa.gov/mars/moons/",
  },
  jupiter: {
    classification: "Gas giant",
    rotation: "≈9.9 hours",
    rotationDescription: "One rapid spin relative to distant stars",
    featureTitle: "A miniature system of worlds",
    featureDescription:
      "Jupiter's cloud bands and Great Red Spot reveal a restless atmosphere. Its four largest moons include icy Europa and Ganymede, the Solar System's largest moon.",
    moonDescription:
      "Its four Galilean moons were first observed by Galileo in 1610. Europa is a major target in the search for potentially habitable environments.",
    notableMoons: "Io · Europa · Ganymede · Callisto",
    moonSourceUrl: "https://science.nasa.gov/jupiter/jupiter-moons/",
  },
  saturn: {
    classification: "Gas giant",
    rotation: "≈10.7 hours",
    rotationDescription: "Approximate rotation period",
    featureTitle: "Rings, icy moons, hidden oceans",
    featureDescription:
      "Saturn's bright rings are made mainly of countless particles of ice and rock. Titan has a thick atmosphere, while Enceladus hides a global ocean beneath its icy crust.",
    moonDescription:
      "Titan is larger than Mercury. Enceladus sends plumes of water-rich material into space, giving scientists access to clues about its ocean.",
    notableMoons: "Titan · Enceladus · Mimas",
    moonSourceUrl: "https://science.nasa.gov/saturn/moons/",
  },
  uranus: {
    classification: "Ice giant",
    rotation: "≈17.2 hours",
    rotationDescription: "One retrograde spin",
    featureTitle: "The planet that rolls around the Sun",
    featureDescription:
      "Uranus is tipped almost onto its side, creating extreme seasonal lighting. Methane in its atmosphere helps give the planet its blue-green appearance.",
    moonDescription:
      "Its larger moons include Titania, Oberon, Ariel, Umbriel, and Miranda. Their names come largely from literature.",
    notableMoons: "Titania · Oberon · Miranda",
    moonSourceUrl: "https://science.nasa.gov/uranus/moons/",
  },
  neptune: {
    classification: "Ice giant",
    rotation: "≈16.1 hours",
    rotationDescription: "One spin relative to distant stars",
    featureTitle: "Storms at the edge of the planets",
    featureDescription:
      "Neptune is a distant, cold world with remarkably fast winds and changing storm systems. Its deep blue appearance is linked in part to methane in the atmosphere.",
    moonDescription:
      "Its largest moon, Triton, orbits in the opposite direction to Neptune's rotation and is likely a captured object.",
    notableMoons: "Triton · Nereid",
    moonSourceUrl: "https://science.nasa.gov/neptune/moons/",
  },
};
