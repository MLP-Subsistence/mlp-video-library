"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { StudioShellProject } from "@/components/studio/studio-shell";

/**
 * The sidebar lives in the studio layout, but which project is open is only
 * known further down the tree. A tiny external store lets the project layout
 * announce itself to the shell without prop drilling through Next layouts.
 */
let current: StudioShellProject = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function useShellProject() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => null
  );
}

export function RegisterShellProject({ project }: { project: NonNullable<StudioShellProject> }) {
  useEffect(() => {
    current = project;
    emit();
    return () => {
      current = null;
      emit();
    };
  }, [project]);
  return null;
}
