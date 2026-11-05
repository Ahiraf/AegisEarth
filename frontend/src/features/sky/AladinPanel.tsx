import { useEffect, useRef, useState } from "react";
import { apiUrl, errorMessage } from "./api";
import type { Frame, Manifest } from "./types";

interface SkyMap {
  displayFITS: (
    url: string,
    options: object,
    onReady: () => void,
    onError: () => void,
  ) => void;
  world2pix: (ra: number, dec: number) => number[] | null;
  pix2world: (x: number, y: number) => number[] | null;
  addCatalog: (catalog: unknown) => void;
}
interface AladinApi {
  init: Promise<void>;
  aladin: (host: HTMLElement, options: object) => SkyMap;
  catalog: (options: object) => { addSources: (sources: unknown[]) => void };
  source: (ra: number, dec: number, data: object) => unknown;
}
function bounded<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Sky map loading timed out")),
      25000,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
export function AladinPanel({
  frame,
  manifest,
}: {
  frame?: Frame;
  manifest: Manifest;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<SkyMap | null>(null);
  const generation = useRef(0);
  const [message, setMessage] = useState(
    "Open the current science frame in the optional Aladin sky map.",
  );
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState("");
  useEffect(
    () => () => {
      generation.current++;
      map.current = null;
    },
    [],
  );
  async function load() {
    if (!frame?.science_image_url || !host.current) return;
    const current = ++generation.current;
    setBusy(true);
    setMessage("Loading Aladin Lite…");
    try {
      const imported = await bounded(import("aladin-lite"));
      const A = imported.default as unknown as AladinApi;
      await bounded(A.init);
      if (current !== generation.current || !host.current) return;
      const region = manifest.request.region;
      const ra = region.ra_deg,
        dec = region.dec_deg;
      if (!map.current) {
        map.current = A.aladin(host.current, {
          survey: [],
          hipsList: [],
          target: `${ra} ${dec}`,
          fov: region.width_arcmin / 60,
          cooFrame: "equatorial",
          showReticle: true,
        });
        const catalog = A.catalog({
          name: "Requested field center · not a detection",
          sourceSize: 12,
          color: "#f5b942",
        });
        catalog.addSources([
          A.source(ra, dec, { label: "Requested field center" }),
        ]);
        map.current.addCatalog(catalog);
      }
      const sky = map.current;
      await bounded(
        new Promise<void>((resolve, reject) =>
          sky.displayFITS(apiUrl(frame.science_image_url!), {}, resolve, () =>
            reject(new Error("The FITS image could not be loaded")),
          ),
        ),
      );
      if (current !== generation.current) return;
      const pixel = sky.world2pix(ra, dec);
      const back = pixel ? sky.pix2world(pixel[0], pixel[1]) : null;
      if (!back) throw new Error("The sky projection is unavailable");
      if (
        Math.max(
          Math.abs(((back[0] - ra + 540) % 360) - 180),
          Math.abs(back[1] - dec),
        ) > 1e-6
      )
        throw new Error("The sky/pixel mapping could not be verified");
      setLoaded(frame.id);
      setMessage(
        `Aladin: ${frame.time.label_utc} · ${frame.spectral.detectors.join(", ")} · ICRS coordinates. Field-center marker is context, not a detection.`,
      );
    } catch (error) {
      if (current === generation.current)
        setMessage(
          `Sky map unavailable: ${errorMessage(error)} Continue with the image player.`,
        );
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  return (
    <details className="sky-details sky-aladin">
      <summary>Optional sky map · Aladin Lite / CDS</summary>
      <p className="note">
        Open a sky-fixed science FITS image. The regular image player works
        independently of this map.
      </p>
      <button
        className="btn btn-s btn-sm"
        disabled={!frame?.science_image_url || busy}
        onClick={() => void load()}
      >
        {busy ? "Loading sky map…" : "Load current frame in Aladin"}
      </button>
      <p className="note" role="status">
        {message}
        {loaded && loaded !== frame?.id
          ? " The movie has moved to another frame; load it to update this map."
          : ""}
      </p>
      <div
        className={`sky-aladin-host${busy || loaded ? " is-active" : ""}`}
        ref={host}
      />
    </details>
  );
}
