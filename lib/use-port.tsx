"use client";
import { useEffect, useRef } from "react";
import { useConnections } from "@/components/connection-manager";
import type { PortMeta } from "./connection-types";


export function usePort(meta: PortMeta, opts?: { audioNode?: AudioNode }) {
  const { registerPort, unregisterPort, registerAudioNode, beginDrag, updateDrag, endDrag, cancelDrag } = useConnections();
  const ref = useRef<HTMLDivElement | null>(null);
  const hovered = useRef<string | null>(null);


  useEffect(() => {
    const el = ref.current; if (!el) return;
    registerPort(meta.portId, { el, direction: meta.direction, kind: meta.kind, moduleId: meta.portId.split("-").slice(0, -2).join("-") || meta.portId });
    if (opts?.audioNode) registerAudioNode(meta.portId, opts.audioNode as any, meta.direction);
    return () => unregisterPort(meta.portId);
  }, [meta.portId]);


  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onPointerDown = (e: PointerEvent) => {
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    beginDrag(meta.portId, e.clientX, e.clientY);
    };
    const onPointerMove = (e: PointerEvent) => { if ((el as any).hasPointerCapture?.(e.pointerId)) updateDrag(e.clientX, e.clientY); };
    const onPointerUp = (e: PointerEvent) => {
    const targetPortId = (e.target as HTMLElement)?.closest?.("[data-port-id]")?.getAttribute("data-port-id") || hovered.current || undefined;
    endDrag(targetPortId ?? undefined);
    try { el.releasePointerCapture(e.pointerId); } catch {}
    };
    const onPointerCancel = () => cancelDrag();
    const onEnter = () => { hovered.current = meta.portId; };
    const onLeave = () => { if (hovered.current === meta.portId) hovered.current = null; };


    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerCancel);
    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);
    return () => {
    el.removeEventListener("pointerdown", onPointerDown);
    el.removeEventListener("pointermove", onPointerMove);
    el.removeEventListener("pointerup", onPointerUp);
    el.removeEventListener("pointercancel", onPointerCancel);
    el.removeEventListener("pointerenter", onEnter);
    el.removeEventListener("pointerleave", onLeave);
    };
  }, [meta.portId]);

  useEffect(() => {
    if (opts?.audioNode) registerAudioNode(meta.portId, opts.audioNode as any, meta.direction)
  }, [opts?.audioNode, meta.portId, meta.direction, registerAudioNode])


  return {
    ref, // attach to the clickable port element
    "data-port-id": meta.portId,
    "data-port-direction": meta.direction,
    "data-audio-kind": meta.kind,
  } as const;
}
