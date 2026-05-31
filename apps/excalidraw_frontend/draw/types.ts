export type Tool =
  | "select"
  | "hand"
  | "pencil"
  | "line"
  | "arrow"
  | "rect"
  | "ellipse"
  | "text"
  | "eraser";

export interface Style {
  stroke: string;
  fill: string; // "transparent" for no fill
  strokeWidth: number;
  fontSize: number;
}

export interface Point {
  x: number;
  y: number;
}

interface BaseShape {
  id: string;
  stroke: string;
  fill: string;
  strokeWidth: number;
}

export interface RectShape extends BaseShape {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EllipseShape extends BaseShape {
  type: "ellipse";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LineShape extends BaseShape {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ArrowShape extends BaseShape {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PencilShape extends BaseShape {
  type: "pencil";
  points: Point[];
}

export interface TextShape extends BaseShape {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export type Shape =
  | RectShape
  | EllipseShape
  | LineShape
  | ArrowShape
  | PencilShape
  | TextShape;

/**
 * Operations sent over the wire (and persisted) so every client can
 * reconstruct board state by replaying them in order.
 */
export type DrawOp =
  | { op: "add"; shape: Shape }
  | { op: "update"; shape: Shape }
  | { op: "delete"; id: string };

export interface RemoteCursor {
  userId: string;
  name: string;
  color: string;
  x: number; // world coords
  y: number;
  lastSeen: number;
}

export const DEFAULT_STYLE: Style = {
  stroke: "#f8f9fa",
  fill: "transparent",
  strokeWidth: 2,
  fontSize: 20,
};
