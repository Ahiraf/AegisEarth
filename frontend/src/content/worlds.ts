export type WorldKind = "orbits" | "solar" | "atmosphere";
export const PLANET_STORIES = [
  "A small, rocky world covered in impact craters. Mercury circles closest to the Sun and completes its year in only 88 Earth days.",
  "The bright globe we see is a thick cloud deck. Beneath it, a dense atmosphere traps heat around a rocky surface.",
  "Our ocean-covered home. Liquid water, an atmosphere and the energy of the Sun support the life we know.",
  "A rocky desert world with a thin atmosphere. Iron minerals in its soil give Mars its familiar rusty colour.",
  "The largest planet is a gas giant. The bands you see are cloud systems moving through its deep atmosphere.",
  "A gas giant surrounded by a spectacular ring system. The rings contain countless pieces of ice and rock.",
  "An ice giant with a pale blue-green atmosphere. Its extreme tilt makes it seem to roll around the Sun on its side.",
  "A distant ice giant with a deep blue atmosphere and powerful winds. Sunlight takes hours to reach it.",
];

// Approximate NASA teaching boundaries. Real boundaries vary with place, season and solar activity.
export const LAYER_LIMITS = [0, 12, 50, 80, 700, 10000];
export const LAYER_ALTITUDES = [5, 25, 65, 420, 1500];
export const LAYER_LESSONS = [
  {
    role: "The air we live in",
    trend: "Usually cools as you go higher",
    example: "Clouds, rain and the water cycle",
    lesson:
      "The lowest layer holds most of our weather. Water moves between oceans, air and land here. Its top is higher near the equator and lower near the poles.",
  },
  {
    role: "Our ultraviolet shield",
    trend: "Warms as you go higher",
    example: "Ozone absorbs ultraviolet sunlight",
    lesson:
      "Ozone absorbs energy from the Sun. That warms the upper part of this layer and helps shield life below from harmful ultraviolet radiation.",
  },
  {
    role: "Where many meteors disappear",
    trend: "Cools as you go higher",
    example: "The streak of a burning meteor",
    lesson:
      "Many small pieces of space debris become bright streaks as they interact with the air here. The top of this layer is extremely cold.",
  },
  {
    role: "Spaceflight in a trace of air",
    trend: "Warms as you go higher",
    example: "The International Space Station",
    lesson:
      "The gas is very thin. Individual particles can have high energy, but there are so few of them that this is very different from standing in hot air on Earth. The ISS orbits in this layer.",
  },
  {
    role: "A gradual transition into space",
    trend: "Extremely sparse gas",
    example: "Many Earth satellites",
    lesson:
      "Particles are so widely separated that collisions become rare. There is no solid outer wall: the atmosphere gradually blends into the space environment.",
  },
];
export function layerAtAltitude(km: number): number {
  const index = LAYER_LIMITS.findIndex((_, i) => km < LAYER_LIMITS[i + 1]);
  return index < 0 ? 4 : index;
}
export const altitudeToSlider = (km: number) =>
  (Math.log1p(km) / Math.log(10001)) * 1000;
export const sliderToAltitude = (value: number) =>
  Math.round(Math.expm1((value / 1000) * Math.log(10001)) * 10) / 10;
