export type Tool =
  | "select"
  | "hand"
  | "pencil"
  | "line"
  | "arrow"
  | "rect"
  | "ellipse"
  | "text"
  | "sticky"
  | "eraser"
  | "laser";

export type StrokeStyle = "solid" | "dashed" | "dotted";

export type BackgroundMode = "blank" | "grid" | "dots";

export interface Style {
  stroke: string;
  fill: string; // "transparent" for no fill
  strokeWidth: number;
  strokeStyle: StrokeStyle;
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
  strokeStyle: StrokeStyle;
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

export interface StickyShape extends BaseShape {
  type: "sticky";
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
}

export interface EntityField {
  name: string;
  type: string;
  pk?: boolean;
  fk?: boolean;
}

export interface EntityShape extends BaseShape {
  type: "entity";
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  fields: EntityField[];
}

export interface RelationShape extends BaseShape {
  type: "relation";
  fromId: string;
  toId: string;
  label?: string;
}

export type Shape =
  | RectShape
  | EllipseShape
  | LineShape
  | ArrowShape
  | PencilShape
  | TextShape
  | StickyShape
  | EntityShape
  | RelationShape;

export const ENTITY_HEADER_H = 30;
export const ENTITY_ROW_H = 22;
export const ENTITY_WIDTH = 220;

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
  chat?: string; // ephemeral cursor-chat text
  chatAt?: number;
}

export interface LaserPoint {
  x: number;
  y: number;
  t: number; // timestamp for fade-out
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  x: number; // world coords
  y: number;
  start: number;
  color: string;
}

export const DEFAULT_STYLE: Style = {
  stroke: "#f8f9fa",
  fill: "transparent",
  strokeWidth: 2,
  strokeStyle: "solid",
  fontSize: 20,
};

export const STICKY_DEFAULT_FILL = "#ffd43b";
export const GRID_SIZE = 20;


export type ThemeName = "dark" | "light" | "contrast";

export interface Theme {
  canvasBg: string;
  gridColor: string;
  dotColor: string;
  defaultStroke: string;
}

export const THEMES: Record<ThemeName, Theme> = {
  dark: {
    canvasBg: "#121212",
    gridColor: "rgba(255,255,255,0.05)",
    dotColor: "rgba(255,255,255,0.12)",
    defaultStroke: "#f8f9fa",
  },
  light: {
    canvasBg: "#ffffff",
    gridColor: "rgba(0,0,0,0.06)",
    dotColor: "rgba(0,0,0,0.16)",
    defaultStroke: "#1e1e1e",
  },
  contrast: {
    canvasBg: "#000000",
    gridColor: "rgba(255,255,255,0.22)",
    dotColor: "rgba(255,255,255,0.4)",
    defaultStroke: "#ffffff",
  },
};
