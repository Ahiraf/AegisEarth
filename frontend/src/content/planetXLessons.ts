export const lessons = [
  {
    name: "Start beyond Neptune",
    title: "What can we see before the search?",
    text: "Find Neptune on the blue path, then look for the small icy worlds on the teal paths. All orbit the Sun. Some distant worlds have orbits that point in similar directions. That clue led astronomers to ask whether another planet’s gravity might help explain them.",
    view: "clue",
  },
  {
    name: "Watch Neptune spin",
    title: "What makes a day?",
    text: "Follow the white marker on Neptune. It turns with the planet while the tilted axis stays in place. One full turn is a day, about 16 hours on Neptune. A trip around the Sun is its year, about 165 Earth years.",
    view: "spin",
  },
  {
    name: "Spot a moving dot",
    title: "Could these sightings be the same object?",
    text: "Imagine a telescope spots a faint dot. On the next two visits it appears a little farther along. Each ring marks a place it was seen. Three positions give astronomers a direction to investigate. The dot’s identity is still an open question.",
    view: "sightings",
  },
  {
    name: "Reveal a possible orbit",
    title: "Where might the dot appear next?",
    text: "Now imagine the dot belongs to Planet X. The dashed curve fits the three imagined sightings. Follow it from the rings to the enlarged planet at the predicted next position. Astronomers could point a telescope there to test that prediction.",
    view: "prediction",
  },
  {
    name: "Test the idea",
    title: "Would finding a planet solve the puzzle?",
    text: "A discovery would give astronomers an orbit and, eventually, a mass to test. They could calculate how much the planet would pull on nearby icy worlds and compare that prediction with the paths they actually measure.",
    view: "test",
  },
] as const;

export type LessonView = (typeof lessons)[number]["view"];
