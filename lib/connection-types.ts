export type AudioKind = "audio" | "cv" | "any";
export type PortDirection = "input" | "output";


export interface PortMeta {
portId: string; // unique: `${moduleId}:${portName}` (no suffix parsing)
moduleId: string;
portName: string; // e.g. "audio-out", "freq-in", "gate-in"
direction: PortDirection;
kind: AudioKind; // what this port carries; oscilloscope inputs can be "any"
}


export interface ConnectionEdge {
id: string; // uuid
from: string; // portId (must be direction: output)
to: string; // portId (must be direction: input)
kind: Exclude<AudioKind, "any">; // "audio" | "cv"
color: string; // wire color from palette
}


export interface PatchJson {
modules: Array<{
id: string;
type: string;
x?: number; y?: number; // position if you support dragging modules
params?: Record<string, number | string | boolean>;
}>;
connections: ConnectionEdge[];
}
