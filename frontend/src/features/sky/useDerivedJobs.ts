import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancel,
  delay,
  errorMessage,
  request,
  submit,
  waitForJob,
} from "./api";
import type { Acceptance, DerivedResult } from "./types";

export interface DerivedTask {
  localId: string;
  kind: string;
  path: string;
  body: unknown;
  key: string;
  phase: "submitting" | "queued" | "running" | "ready" | "error" | "canceled";
  receipt?: Acceptance;
  result?: DerivedResult;
  error?: string;
}
export function useDerivedJobs() {
  const [tasks, setTasks] = useState<DerivedTask[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  useEffect(
    () => () => {
      controllers.current.forEach((c) => c.abort());
      controllers.current.clear();
    },
    [],
  );
  const update = useCallback(
    (id: string, patch: Partial<DerivedTask>) =>
      setTasks((all) =>
        all.map((t) => (t.localId === id ? { ...t, ...patch } : t)),
      ),
    [],
  );
  const execute = useCallback(
    async (task: DerivedTask) => {
      controllers.current.get(task.localId)?.abort();
      const controller = new AbortController();
      controllers.current.set(task.localId, controller);
      const signal = controller.signal;
      update(task.localId, {
        phase: task.receipt ? "queued" : "submitting",
        error: undefined,
      });
      try {
        const receipt =
          task.receipt ||
          (await submit(task.path, task.body, task.key, signal));
        update(task.localId, { receipt, phase: "queued" });
        await waitForJob(receipt.id, signal, (job) => {
          if (!signal.aborted)
            update(task.localId, {
              phase: job.status === "running" ? "running" : "queued",
            });
        });
        if (!receipt.result_url)
          throw new Error("This job did not return a result link.");
        for (let i = 0; i < 30; i++) {
          const reply = await request<DerivedResult>(receipt.result_url, {
            signal,
          });
          if (reply.status === 202) {
            await delay(reply.retryAfter * 1000, signal);
            continue;
          }
          if (!signal.aborted)
            update(task.localId, { phase: "ready", result: reply.data });
          return;
        }
        throw new Error("The result is not ready yet. Check this job again.");
      } catch (error) {
        if (!signal.aborted)
          update(task.localId, { phase: "error", error: errorMessage(error) });
      }
    },
    [update],
  );
  const start = useCallback(
    (kind: string, path: string, body: unknown) => {
      const task: DerivedTask = {
        localId: crypto.randomUUID(),
        kind,
        path,
        body: structuredClone(body),
        key: crypto.randomUUID(),
        phase: "submitting",
      };
      setTasks((all) => [task, ...all]);
      void execute(task);
    },
    [execute],
  );
  const stop = useCallback(
    async (task: DerivedTask) => {
      if (!task.receipt?.cancel_token) return;
      try {
        const outcome = await cancel(
          task.receipt.id,
          task.receipt.cancel_token,
        );
        if (outcome.status === "succeeded") {
          await execute(task);
          return;
        }
        controllers.current.get(task.localId)?.abort();
        update(task.localId, { phase: "canceled", error: undefined });
      } catch (error) {
        update(task.localId, { error: errorMessage(error) });
      }
    },
    [update, execute],
  );
  return {
    tasks,
    start,
    retry: execute,
    stop,
    busy: tasks.some((t) =>
      ["submitting", "queued", "running"].includes(t.phase),
    ),
  };
}
