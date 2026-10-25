import type { SkyPosition } from '../types/observation';

const DEG = Math.PI / 180;

/** Angle between two sky positions, in degrees (haversine formula). */
export function angularSeparationDeg(a: SkyPosition, b: SkyPosition): number {
  const dRa = (b.raDeg - a.raDeg) * DEG;
  const dDec = (b.decDeg - a.decDeg) * DEG;
  const h =
    Math.sin(dDec / 2) ** 2 + Math.cos(a.decDeg * DEG) * Math.cos(b.decDeg * DEG) * Math.sin(dRa / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(h)))) / DEG;
}
