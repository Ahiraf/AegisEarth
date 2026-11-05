export const FIRST_MOVIE = [
  {
    title: 'Pick a place in the sky',
    text: 'In Find observations, keep the starting Pinwheel Galaxy (M101) coordinates or choose a challenge target. A target button fills in the sky coordinates and sets the field size.',
  },
  {
    title: 'Keep the first search simple',
    text: 'For M101, start with a 5 × 5 arcminute field, leave both dates empty, and keep Common available wavelengths. Set Maximum source images to 3 for a small first request.',
  },
  {
    title: 'Prepare the sky movie',
    text: 'Select Prepare sky movie. The page takes you to the progress card while the app looks up and prepares images. If you only want to see what the archive lists, use Find observation records.',
  },
  {
    title: 'Play, pause and compare',
    text: 'In Sky time viewer, start with Chronological sequence. Press Play or step through images one at a time. Read the date on each frame, then try Blink A / B or Side by side when two suitable images are available.',
  },
];

export const SPECTRAL_OPTIONS = [
  {
    title: 'Common available wavelengths',
    text: 'Start here. AegisEarth looks for compatible wavelength coverage across observations. The available dates and bands depend on the patch of sky you selected.',
  },
  {
    title: 'Choose detector',
    text: 'Pick D1 through D6 to focus on one of SPHEREx’s six broad wavelength ranges. The exact wavelength measured at your sky position depends on where its light fell on that detector.',
  },
  {
    title: 'Choose nominal channel',
    text: 'Pick one of the 102 numbered wavelength channels to focus on a narrower part of the spectrum. A given patch of sky may have few or zero matching images at that channel. Switch back to common wavelengths if you want more options.',
  },
];

export const TARGETS = [
  ['Barnard’s Star', 'A nearby star. Look for a point that shifts relative to nearby background points.'],
  ['Epsilon Indi B', 'A pair of brown dwarfs. Explore the field around the pair, which may appear blended into one point at this image resolution.'],
  ['WISE 0855', 'A cold brown dwarf that moves across the sky. It can be faint, so compare matching wavelengths and check how much of the field was imaged.'],
  ['RW Aurigae', 'A variable star. Look for a point that changes brightness while staying in roughly the same place.'],
  ['R Draconis', 'Another variable star. Look for brightness changes across dates using the same wavelength and display stretch.'],
];

export const VIEWER_TOOLS = [
  {
    title: 'Signed difference',
    text: 'Subtracts an earlier image from a later image after checking the inputs. A positive patch means brighter pixel values in the later image. A negative patch means lower values. A shift can leave a bright patch near the new position and a dark patch near the old one. Alignment errors can do this too.',
  },
  {
    title: 'Detector composites',
    text: 'Combines compatible images from a detector. Combining several images can make faint, steady features easier to see. A moving point can blur or show up more than once, so return to the individual frames to look for motion.',
  },
  {
    title: 'Diagnostic spectra',
    text: 'Shows how measured light changes with wavelength at a selected sky position. Read wavelength along the bottom and measured light up the side. A gap means there is no sample there. Treat the points as a first look and check the reported quality and uncertainty.',
  },
  {
    title: 'Gaia, WISE and Aladin',
    text: 'In Survey context, turn on Gaia or WISE to see reference sources or an older WISE image. They were measured at different times and wavelengths. Compare their dates before matching points. Aladin Lite is an optional interactive sky map for opening a sky-fixed FITS image.',
  },
  {
    title: 'Share, refresh and download',
    text: 'A coordinate link reopens your search settings. A saved view link reopens the same prepared result until it expires. Check latest data & rebuild creates a new result. Download a PNG for an image you can open anywhere, FITS for numeric data, or CSV or JSON for the settings and source records. Movie export can turn supported frames into a video.',
  },
];

export const ORBIT_TERMS = [
  ['Orbital period / orbit time', 'The time it takes to go around once. Earth takes about 365 days to orbit the Sun. It spins once on its own axis in about 24 hours. That spin is rotation.'],
  ['Diameter and radius', 'A planet’s diameter is its width through the centre. Its radius is the distance from the centre to the surface, half the diameter. Earth is about 12,756 km across at its equator.'],
  ['Altitude and distance', 'Altitude is height above the surface. A spacecraft 650 km above Earth is about 650 km above the ground directly below it. Distance from Sun describes the size of a planet’s orbit. It is usually given as a representative distance because the distance can change during the orbit.'],
  ['Inclination', 'How much an orbit is tilted compared with a reference plane. For Earth satellites that plane is usually Earth’s equator. An orbit close to 90° passes near the poles.'],
  ['Low, medium and geostationary orbits', 'The space station flies in low Earth orbit. Navigation satellites such as Galileo fly farther out in medium Earth orbit. A geostationary satellite orbits above the equator at the same rate Earth turns, so it appears to stay above one spot.'],
  ['Polar and Sun-synchronous', 'A polar orbit passes near both poles. A Sun-synchronous orbit crosses an area at roughly the same local solar time on each pass in the same direction. SPHEREx uses a nearly polar, Sun-synchronous orbit.'],
  ['Moons and rings', 'A moon is a natural satellite that orbits a planet or another body. Rings are wide bands of many small particles orbiting together. Their sizes and distances can look very different in a simplified model.'],
  ['Astronomical unit (AU)', 'A convenient unit for large distances in the Solar System. One AU is about 150 million km, roughly the average distance from Earth to the Sun.'],
];
