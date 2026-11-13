import { useEffect, useState } from "react";
import { errorMessage, frames, get, waitForJob } from "./api";
import type {
  DetectorOptions,
  Frame,
  Job,
  Manifest,
  Preparation,
  TimelineMode,
} from "./types";

export interface SkyViewState {
  viewId?: string;
  mode?: TimelineMode;
  loading: boolean;
  job?: Job;
  manifest?: Manifest;
  frames: Frame[];
  preparation?: Preparation;
  options?: DetectorOptions;
  error?: string;
  detailErrors: string[];
}
const EMPTY: SkyViewState = { loading: false, frames: [], detailErrors: [] };
export function useSkyView(
  id: string | null,
  mode: TimelineMode,
  reload: number,
) {
  const [state, setState] = useState<SkyViewState & { reload?: number }>(EMPTY);
  useEffect(() => {
    if (!id) {
      setState(EMPTY);
      return;
    }
    const controller = new AbortController();
    const signal = controller.signal;
    setState({ ...EMPTY, viewId: id, mode, reload, loading: true });
    (async () => {
      try {
        const job = await waitForJob(id, signal, (job) => {
          if (!signal.aborted) setState((s) => ({ ...s, job }));
        });
        if (signal.aborted) return;
        const manifest = await get<Manifest>(
          `/api/v1/views/${id}/manifest`,
          signal,
        );
        if (signal.aborted) return;
        const first = manifest.timelines[mode].first_frame;
        setState({
          ...EMPTY,
          viewId: id,
          mode,
          reload,
          loading: true,
          job,
          manifest,
          frames: first ? [first] : [],
        });
        const timeline = await frames(manifest, mode, signal, (items) => {
          if (!signal.aborted) setState((s) => ({ ...s, frames: items }));
        });
        if (signal.aborted) return;
        setState((s) => ({ ...s, loading: false, frames: timeline }));
        const extra = await Promise.allSettled([
          get<Preparation>(`/api/v1/views/${id}/preparation`, signal),
          get<DetectorOptions>(`/api/v1/views/${id}/coadds/options`, signal),
        ]);
        if (signal.aborted) return;
        setState((s) => ({
          ...s,
          preparation:
            extra[0].status === "fulfilled" ? extra[0].value : undefined,
          options: extra[1].status === "fulfilled" ? extra[1].value : undefined,
          detailErrors: extra.flatMap((v) =>
            v.status === "rejected" ? [errorMessage(v.reason)] : [],
          ),
        }));
      } catch (error) {
        if (!signal.aborted)
          setState((s) => ({
            ...s,
            loading: false,
            error: errorMessage(error),
          }));
      }
    })();
    return () => controller.abort();
  }, [id, mode, reload]);
  return state.viewId === id && state.mode === mode && state.reload === reload
    ? state
    : { ...EMPTY, loading: Boolean(id) };
}
