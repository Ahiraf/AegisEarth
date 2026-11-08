import {
  ESA_GALILEO,
  ESA_GALILEO_ORBIT,
  JPL_SPHEREX,
  JPL_SPHEREX_FACTS,
  JPL_SPHEREX_KIT,
  NASA_HUBBLE_FACTS,
  NASA_ISS_FACTS,
  NASA_ISS_ORBIT,
  NASA_ORBIT_TYPES,
  NOAA_ABI,
  NOAA_GEO,
  NOAA_GLM,
  type SourceRef,
} from "./sources";

export type Fact = { label: string; value: string; source: SourceRef };
export type OrbitObject = {
  id: string;
  name: string;
  fullName: string;
  category: string;
  summary: string;
  summarySource: SourceRef;
  orbitExplanation: string;
  placementKm: number;
  periodHours: number;
  inclinationDeg: number;
  color: string;
  facts: Fact[];
};

// Agency references reviewed 8 November 2026. Reference values, not current telemetry.
// Orbital phases and nodes in the scene are illustrative. Galileo/GOES represent families.
export const ORBIT_OBJECTS: OrbitObject[] = [
  {
    id: "iss",
    name: "ISS",
    fullName: "International Space Station",
    category: "Crewed laboratory · Low Earth orbit",
    summary:
      "A shared home and laboratory above Earth. Astronauts live, exercise and run experiments in microgravity, while teams on the ground learn how people and equipment cope with space.",
    summarySource: NASA_ISS_FACTS,
    orbitExplanation:
      "Its tilted path carries it north and south of the equator. It circles Earth many times each day; the drawn spacecraft is much larger than it would be at this distance.",
    placementKm: 420,
    periodHours: 1.55,
    inclinationDeg: 51.6,
    color: "#4CC3F0",
    facts: [
      {
        label: "Orbit time",
        value: "Roughly 90–93 minutes per lap",
        source: NASA_ISS_ORBIT,
      },
      {
        label: "Orbit tilt",
        value: "51.6° relative to the equator",
        source: NASA_ISS_ORBIT,
      },
      {
        label: "Daily laps",
        value: "About 16 trips around Earth",
        source: NASA_ISS_FACTS,
      },
      {
        label: "People aboard",
        value: "Usually seven; more during crew changes",
        source: NASA_ISS_FACTS,
      },
      {
        label: "Human presence",
        value: "Uninterrupted since November 2000",
        source: NASA_ISS_FACTS,
      },
      {
        label: "Overall span",
        value: "109 m from end to end",
        source: NASA_ISS_FACTS,
      },
      {
        label: "Partnership",
        value: "NASA, Roscosmos, ESA, JAXA and CSA",
        source: NASA_ISS_FACTS,
      },
      {
        label: "Robotic helper",
        value: "Canadarm2 moves equipment and assists spacewalks",
        source: NASA_ISS_FACTS,
      },
    ],
  },
  {
    id: "hubble",
    name: "Hubble",
    fullName: "Hubble Space Telescope",
    category: "Space telescope · Low Earth orbit",
    summary:
      "An observatory above the atmosphere, studying stars, galaxies and the expanding universe. Its mirrors gather ultraviolet, visible and near-infrared light that reveal different details of the same object.",
    summarySource: NASA_HUBBLE_FACTS,
    orbitExplanation:
      "Hubble follows a relatively shallow tilted orbit. Its altitude slowly changes, so the reference height shown here is approximate rather than a live measurement.",
    placementKm: 483,
    periodHours: 95 / 60,
    inclinationDeg: 28.5,
    color: "#C9A7FF",
    facts: [
      {
        label: "Reference height",
        value: "About 483 km above Earth; changes over time",
        source: NASA_HUBBLE_FACTS,
      },
      {
        label: "Orbit time",
        value: "Roughly 95 minutes per lap",
        source: NASA_HUBBLE_FACTS,
      },
      {
        label: "Orbit tilt",
        value: "28.5° relative to the equator",
        source: NASA_HUBBLE_FACTS,
      },
      {
        label: "Travel speed",
        value: "Approximately 27,000 km/h",
        source: NASA_HUBBLE_FACTS,
      },
      {
        label: "Main mirror",
        value: "2.4 m across",
        source: NASA_HUBBLE_FACTS,
      },
      {
        label: "Light collected",
        value: "Ultraviolet, visible and near-infrared",
        source: NASA_HUBBLE_FACTS,
      },
      { label: "Body length", value: "13.2 m", source: NASA_HUBBLE_FACTS },
      {
        label: "Servicing",
        value: "Upgraded during five astronaut visits",
        source: NASA_HUBBLE_FACTS,
      },
    ],
  },
  {
    id: "spherex",
    name: "SPHEREx",
    fullName: "SPHEREx infrared observatory",
    category: "Sky survey · Polar orbit",
    summary:
      "The mission behind AegisEarth’s sky images. SPHEREx splits near-infrared light into many wavelength channels, helping researchers investigate galaxies and the ingredients for water and other molecules in space.",
    summarySource: JPL_SPHEREX,
    orbitExplanation:
      "Its path passes near the poles and follows Earth’s day–night boundary. This Sun-synchronous geometry helps protect the cold telescope from sunlight while it looks out into space.",
    placementKm: 650,
    periodHours: 98 / 60,
    inclinationDeg: 90,
    color: "#F5B942",
    facts: [
      {
        label: "Designed height",
        value: "650 km above Earth",
        source: JPL_SPHEREX_KIT,
      },
      {
        label: "Orbit time",
        value: "Approximately 98 minutes per lap",
        source: JPL_SPHEREX_KIT,
      },
      {
        label: "Orbit geometry",
        value: "Near-polar and Sun-synchronous",
        source: JPL_SPHEREX_KIT,
      },
      { label: "Launch date", value: "11 March 2025", source: JPL_SPHEREX },
      {
        label: "Spectral channels",
        value: "102 near-infrared wavelength channels",
        source: JPL_SPHEREX_FACTS,
      },
      {
        label: "Survey design",
        value: "One complete sky map about every six months",
        source: JPL_SPHEREX_FACTS,
      },
      {
        label: "Telescope size",
        value: "20 cm effective aperture",
        source: JPL_SPHEREX_FACTS,
      },
      { label: "Spacecraft mass", value: "502 kg", source: JPL_SPHEREX_FACTS },
    ],
  },
  {
    id: "galileo",
    name: "Galileo",
    fullName: "Galileo navigation satellites",
    category: "Navigation constellation · Medium Earth orbit",
    summary:
      "Europe’s satellite navigation system sends precise timing signals that receivers use to work out their location. It works alongside other navigation systems, including GPS, and also supports search-and-rescue services.",
    summarySource: ESA_GALILEO,
    orbitExplanation:
      "These satellites orbit much higher than the space station. The marker represents one member of a constellation, not every Galileo satellite or its current position.",
    placementKm: 23222,
    periodHours: 14,
    inclinationDeg: 56,
    color: "#FF8A65",
    facts: [
      {
        label: "Nominal height",
        value: "23,222 km above Earth",
        source: ESA_GALILEO,
      },
      {
        label: "Orbit time",
        value: "About 14 hours per lap",
        source: ESA_GALILEO_ORBIT,
      },
      {
        label: "Orbit tilt",
        value: "56° relative to the equator",
        source: ESA_GALILEO,
      },
      {
        label: "Orbit arrangement",
        value: "Three main orbital planes",
        source: ESA_GALILEO,
      },
      {
        label: "Main purpose",
        value: "Position, navigation and accurate timing",
        source: ESA_GALILEO,
      },
      {
        label: "Works alongside",
        value: "GPS and other navigation systems",
        source: ESA_GALILEO,
      },
      {
        label: "Rescue role",
        value: "Relays distress alerts to rescue coordinators",
        source: ESA_GALILEO,
      },
      {
        label: "Initial services",
        value: "Available from 15 December 2016",
        source: ESA_GALILEO,
      },
    ],
  },
  {
    id: "goes",
    name: "GOES",
    fullName: "GOES-R series weather satellites",
    category: "Weather monitoring · Geostationary orbit",
    summary:
      "Weather observatories that keep watching the same side of Earth. Their images help forecasters follow clouds, fires and developing storms, while a dedicated instrument maps lightning.",
    summarySource: NOAA_ABI,
    orbitExplanation:
      "A geostationary satellite travels above the equator at the same rate that Earth turns. From the ground it appears to stay over one longitude. One representative spacecraft is shown.",
    placementKm: 35786,
    periodHours: 23.934,
    inclinationDeg: 0,
    color: "#F06292",
    facts: [
      {
        label: "Nominal height",
        value: "35,786 km above Earth",
        source: NOAA_GEO,
      },
      {
        label: "Orbit time",
        value: "One Earth rotation, about 23 h 56 min",
        source: NASA_ORBIT_TYPES,
      },
      {
        label: "Ground view",
        value: "Remains over the same equatorial longitude",
        source: NOAA_GEO,
      },
      {
        label: "Main camera",
        value: "Advanced Baseline Imager (ABI)",
        source: NOAA_ABI,
      },
      {
        label: "Imaging channels",
        value: "16 visible and infrared spectral bands",
        source: NOAA_ABI,
      },
      {
        label: "Whole-disk image",
        value: "Every 10 minutes in the described scan mode",
        source: NOAA_ABI,
      },
      {
        label: "Small-area scans",
        value: "Every 30–60 seconds",
        source: NOAA_ABI,
      },
      {
        label: "Lightning sensor",
        value:
          "GLM detects lightning within and between clouds, and toward the ground",
        source: NOAA_GLM,
      },
    ],
  },
];
