import axios from "axios";
import { BACKEND_URL } from "@/config";
import { getToken } from "@/lib/auth";
import {
  DEFAULT_STYLE,
  DrawOp,
  RemoteCursor,
  Shape,
  Style,
  Tool,
} from "./types";

function uid(): string {
  return (
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  );
}

interface HistoryEntry {
  undo: DrawOp;
  redo: DrawOp;
}

export interface EngineCallbacks {
  onToolChange?: (tool: Tool) => void;
  onViewChange?: (zoomPercent: number) => void;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
}

type Mode = "idle" | "drawing" | "panning" | "moving";

export class CanvasEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private roomId: string;
  private socket: WebSocket;
  private callbacks: EngineCallbacks;

  private shapes = new Map<string, Shape>();
  private remoteCursors = new Map<string, RemoteCursor>();

  private tool: Tool = "select";
  private style: Style = { ...DEFAULT_STYLE };

  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;

  private mode: Mode = "idle";
  private draft: Shape | null = null;
  private startWorld = { x: 0, y: 0 };
  private panStart = { x: 0, y: 0 };
  private panOrigin = { x: 0, y: 0 };
  private spaceHeld = false;

  private selectedId: string | null = null;
  private moveOriginal: Shape | null = null;

  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  private cursorName = "Anonymous";
  private cursorColor = "#1971c2";
  private lastCursorSent = 0;

  private cursorPruneTimer: ReturnType<typeof setInterval> | null = null;
  private textEditor: HTMLTextAreaElement | null = null;
  private destroyed = false;

  constructor(
    canvas: HTMLCanvasElement,
    roomId: string,
    socket: WebSocket,
    callbacks: EngineCallbacks = {}
  ) {
    this.canvas = canvas;
    this.roomId = roomId;
    this.socket = socket;
    this.callbacks = callbacks;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;
  }

  async init(): Promise<void> {
    await this.loadHistory();
    if (this.destroyed) return;
    this.attachListeners();
    this.cursorPruneTimer = setInterval(() => this.pruneCursors(), 2000);
    this.render();
    this.emitHistory();
  }

  destroy(): void {
    this.destroyed = true;
    this.detachListeners();
    if (this.cursorPruneTimer) clearInterval(this.cursorPruneTimer);
    this.removeTextEditor();
  }

  // ---------- Public API (called from React) ----------

  setTool(tool: Tool): void {
    if (this.tool === tool) return;
    this.tool = tool;
    if (tool !== "select") this.selectedId = null;
    this.updateCursorStyle();
    this.render();
  }

  setStyle(partial: Partial<Style>): void {
    this.style = { ...this.style, ...partial };
    // Apply style live to the currently selected shape.
    if (this.selectedId) {
      const shape = this.shapes.get(this.selectedId);
      if (shape) {
        const updated = {
          ...shape,
          stroke: this.style.stroke,
          fill: this.style.fill,
          strokeWidth: this.style.strokeWidth,
        } as Shape;
        const before = shape;
        this.commitLocalOp(
          { op: "update", shape: updated },
          { op: "update", shape: before }
        );
      }
    }
  }

  setCursorIdentity(name: string, color: string): void {
    this.cursorName = name;
    this.cursorColor = color;
  }

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;
    this.applyOp(entry.undo);
    this.broadcastOp(entry.undo);
    this.redoStack.push(entry);
    this.render();
    this.emitHistory();
  }

  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this.applyOp(entry.redo);
    this.broadcastOp(entry.redo);
    this.undoStack.push(entry);
    this.render();
    this.emitHistory();
  }

  deleteSelected(): void {
    if (!this.selectedId) return;
    const shape = this.shapes.get(this.selectedId);
    if (!shape) return;
    this.commitLocalOp(
      { op: "delete", id: shape.id },
      { op: "add", shape }
    );
    this.selectedId = null;
    this.render();
  }

  zoomIn(): void {
    this.zoomAt(this.canvas.width / 2, this.canvas.height / 2, 1.2);
  }

  zoomOut(): void {
    this.zoomAt(this.canvas.width / 2, this.canvas.height / 2, 1 / 1.2);
  }

  resetView(): void {
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.emitView();
    this.render();
  }

  zoomToFit(): void {
    const bounds = this.contentBounds();
    if (!bounds) {
      this.resetView();
      return;
    }
    const pad = 60;
    const w = bounds.maxX - bounds.minX || 1;
    const h = bounds.maxY - bounds.minY || 1;
    const scale = Math.min(
      (this.canvas.width - pad * 2) / w,
      (this.canvas.height - pad * 2) / h,
      4
    );
    this.scale = Math.max(0.1, scale);
    this.offsetX =
      (this.canvas.width - w * this.scale) / 2 - bounds.minX * this.scale;
    this.offsetY =
      (this.canvas.height - h * this.scale) / 2 - bounds.minY * this.scale;
    this.emitView();
    this.render();
  }

  // ---------- History loading & remote messages ----------

  private async loadHistory(): Promise<void> {
    const token = getToken();
    try {
      const res = await axios.get(`${BACKEND_URL}/chat/${this.roomId}`, {
        headers: token ? { Authorization: token } : undefined,
      });
      const messages: { message: string }[] = res.data.messages ?? [];
      for (const m of messages) {
        const op = this.parseMessage(m.message);
        if (op) this.applyOp(op);
      }
    } catch {
      // Empty / unreachable history — start with a blank board.
    }
  }

  handleSocketMessage = (event: MessageEvent): void => {
    let data: { type?: string; message?: string } & Record<string, unknown>;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    if (data.type === "chat" && typeof data.message === "string") {
      const op = this.parseMessage(data.message);
      if (op) {
        this.applyOp(op); // idempotent — safe even for our own echo
        this.render();
      }
      return;
    }

    if (data.type === "cursor") {
      const from = data.from as string | undefined;
      if (!from) return;
      this.remoteCursors.set(from, {
        userId: from,
        name: (data.name as string) || "Anonymous",
        color: (data.color as string) || "#1971c2",
        x: Number(data.x) || 0,
        y: Number(data.y) || 0,
        lastSeen: Date.now(),
      });
      this.render();
    }
  };

  /** Parse a wire message into a DrawOp, tolerating the legacy `{shape}` form. */
  private parseMessage(raw: string): DrawOp | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;

    if (obj.op === "delete" && typeof obj.id === "string") {
      return { op: "delete", id: obj.id };
    }
    if (
      (obj.op === "add" || obj.op === "update") &&
      obj.shape &&
      typeof obj.shape === "object"
    ) {
      return { op: obj.op, shape: this.normalizeShape(obj.shape) };
    }
    // Legacy: { shape: {...} } with no op, possibly old rect/circle format.
    if (obj.shape && typeof obj.shape === "object") {
      return { op: "add", shape: this.normalizeShape(obj.shape) };
    }
    return null;
  }

  private normalizeShape(input: unknown): Shape {
    const s = input as Record<string, unknown>;
    const base = {
      id: typeof s.id === "string" ? s.id : uid(),
      stroke: (s.stroke as string) || "#f8f9fa",
      fill: (s.fill as string) || "transparent",
      strokeWidth: (s.strokeWidth as number) || 2,
    };
    // Legacy circle -> ellipse bounding box.
    if (s.type === "circle") {
      const cx = Number(s.centerX) || 0;
      const cy = Number(s.centerY) || 0;
      const r = Number(s.radius) || 0;
      return {
        ...base,
        type: "ellipse",
        x: cx - r,
        y: cy - r,
        width: r * 2,
        height: r * 2,
      };
    }
    return { ...base, ...(s as object) } as Shape;
  }

  // ---------- Local op commit ----------

  private commitLocalOp(redo: DrawOp, undo: DrawOp): void {
    this.applyOp(redo);
    this.broadcastOp(redo);
    this.undoStack.push({ undo, redo });
    this.redoStack = [];
    this.render();
    this.emitHistory();
  }

  private applyOp(op: DrawOp): void {
    if (op.op === "add" || op.op === "update") {
      this.shapes.set(op.shape.id, op.shape);
    } else if (op.op === "delete") {
      this.shapes.delete(op.id);
      if (this.selectedId === op.id) this.selectedId = null;
    }
  }

  private broadcastOp(op: DrawOp): void {
    if (this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(
      JSON.stringify({
        type: "chat",
        roomId: this.roomId,
        message: JSON.stringify(op),
      })
    );
  }

  // ---------- Coordinate helpers ----------

  private canvasPoint(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.offsetX) / this.scale,
      y: (sy - this.offsetY) / this.scale,
    };
  }

  private worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: wx * this.scale + this.offsetX,
      y: wy * this.scale + this.offsetY,
    };
  }

  private zoomAt(sx: number, sy: number, factor: number): void {
    const world = this.screenToWorld(sx, sy);
    this.scale = Math.min(8, Math.max(0.1, this.scale * factor));
    this.offsetX = sx - world.x * this.scale;
    this.offsetY = sy - world.y * this.scale;
    this.emitView();
    this.render();
  }

  // ---------- Event listeners ----------

  private attachListeners(): void {
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mouseup", this.onMouseUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.socket.addEventListener("message", this.handleSocketMessage);
    this.updateCursorStyle();
  }

  private detachListeners(): void {
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.socket.removeEventListener("message", this.handleSocketMessage);
  }

  private updateCursorStyle(): void {
    const map: Record<Tool, string> = {
      select: "default",
      hand: "grab",
      pencil: "crosshair",
      line: "crosshair",
      arrow: "crosshair",
      rect: "crosshair",
      ellipse: "crosshair",
      text: "text",
      eraser: "cell",
    };
    this.canvas.style.cursor = this.spaceHeld ? "grab" : map[this.tool];
  }

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    const sp = this.canvasPoint(e);
    const w = this.screenToWorld(sp.x, sp.y);

    if (this.tool === "hand" || this.spaceHeld) {
      this.mode = "panning";
      this.panStart = sp;
      this.panOrigin = { x: this.offsetX, y: this.offsetY };
      this.canvas.style.cursor = "grabbing";
      return;
    }

    if (this.tool === "text") {
      this.openTextEditor(w);
      return;
    }

    if (this.tool === "eraser") {
      this.mode = "drawing";
      this.eraseAt(w);
      return;
    }

    if (this.tool === "select") {
      const hit = this.hitTest(w);
      this.selectedId = hit ? hit.id : null;
      if (hit) {
        this.mode = "moving";
        this.moveOriginal = { ...hit } as Shape;
        this.startWorld = w;
      }
      this.render();
      return;
    }

    // Drawing tools
    this.mode = "drawing";
    this.startWorld = w;
    const common = {
      id: uid(),
      stroke: this.style.stroke,
      fill: this.style.fill,
      strokeWidth: this.style.strokeWidth,
    };
    if (this.tool === "pencil") {
      this.draft = { ...common, type: "pencil", points: [w] };
    } else if (this.tool === "line") {
      this.draft = { ...common, type: "line", x1: w.x, y1: w.y, x2: w.x, y2: w.y };
    } else if (this.tool === "arrow") {
      this.draft = { ...common, type: "arrow", x1: w.x, y1: w.y, x2: w.x, y2: w.y };
    } else if (this.tool === "rect") {
      this.draft = { ...common, type: "rect", x: w.x, y: w.y, width: 0, height: 0 };
    } else if (this.tool === "ellipse") {
      this.draft = { ...common, type: "ellipse", x: w.x, y: w.y, width: 0, height: 0 };
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    const sp = this.canvasPoint(e);
    const w = this.screenToWorld(sp.x, sp.y);
    this.maybeSendCursor(w);

    if (this.mode === "panning") {
      this.offsetX = this.panOrigin.x + (sp.x - this.panStart.x);
      this.offsetY = this.panOrigin.y + (sp.y - this.panStart.y);
      this.render();
      return;
    }

    if (this.mode === "moving" && this.selectedId) {
      const shape = this.shapes.get(this.selectedId);
      if (!shape) return;
      const dx = w.x - this.startWorld.x;
      const dy = w.y - this.startWorld.y;
      this.translateShape(shape, this.moveOriginal!, dx, dy);
      this.render();
      return;
    }

    if (this.mode === "drawing" && this.tool === "eraser") {
      this.eraseAt(w);
      return;
    }

    if (this.mode === "drawing" && this.draft) {
      this.updateDraft(w);
      this.render();
    }
  };

  private onMouseUp = (): void => {
    if (this.mode === "panning") {
      this.mode = "idle";
      this.updateCursorStyle();
      return;
    }

    if (this.mode === "moving" && this.selectedId && this.moveOriginal) {
      const shape = this.shapes.get(this.selectedId);
      if (shape) {
        this.commitLocalOp(
          { op: "update", shape: { ...shape } },
          { op: "update", shape: this.moveOriginal }
        );
      }
      this.moveOriginal = null;
      this.mode = "idle";
      return;
    }

    if (this.mode === "drawing" && this.draft) {
      const shape = this.draft;
      this.draft = null;
      this.mode = "idle";
      if (this.isMeaningful(shape)) {
        this.commitLocalOp(
          { op: "add", shape },
          { op: "delete", id: shape.id }
        );
      } else {
        this.render();
      }
      return;
    }

    this.mode = "idle";
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const sp = this.canvasPoint(e);
    if (e.ctrlKey || e.metaKey) {
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      this.zoomAt(sp.x, sp.y, factor);
    } else {
      this.offsetX -= e.deltaX;
      this.offsetY -= e.deltaY;
      this.render();
    }
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }

    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      this.redo();
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (this.selectedId) {
        e.preventDefault();
        this.deleteSelected();
      }
      return;
    }
    if (e.code === "Space" && !this.spaceHeld) {
      this.spaceHeld = true;
      this.updateCursorStyle();
      return;
    }

    const shortcuts: Record<string, Tool> = {
      v: "select",
      h: "hand",
      p: "pencil",
      l: "line",
      a: "arrow",
      r: "rect",
      o: "ellipse",
      t: "text",
      e: "eraser",
    };
    const tool = shortcuts[e.key.toLowerCase()];
    if (tool) {
      this.setTool(tool);
      this.callbacks.onToolChange?.(tool);
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === "Space") {
      this.spaceHeld = false;
      this.updateCursorStyle();
    }
  };

  // ---------- Drawing helpers ----------

  private updateDraft(w: { x: number; y: number }): void {
    const s = this.draft;
    if (!s) return;
    if (s.type === "pencil") {
      s.points.push(w);
    } else if (s.type === "line" || s.type === "arrow") {
      s.x2 = w.x;
      s.y2 = w.y;
    } else if (s.type === "rect" || s.type === "ellipse") {
      s.x = Math.min(this.startWorld.x, w.x);
      s.y = Math.min(this.startWorld.y, w.y);
      s.width = Math.abs(w.x - this.startWorld.x);
      s.height = Math.abs(w.y - this.startWorld.y);
    }
  }

  private translateShape(
    target: Shape,
    original: Shape,
    dx: number,
    dy: number
  ): void {
    if (target.type === "pencil" && original.type === "pencil") {
      target.points = original.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    } else if (
      (target.type === "line" || target.type === "arrow") &&
      (original.type === "line" || original.type === "arrow")
    ) {
      target.x1 = original.x1 + dx;
      target.y1 = original.y1 + dy;
      target.x2 = original.x2 + dx;
      target.y2 = original.y2 + dy;
    } else if (
      "x" in target &&
      "y" in target &&
      "x" in original &&
      "y" in original
    ) {
      target.x = original.x + dx;
      target.y = original.y + dy;
    }
  }

  private isMeaningful(s: Shape): boolean {
    if (s.type === "pencil") return s.points.length > 1;
    if (s.type === "line" || s.type === "arrow") {
      return Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 2;
    }
    if (s.type === "rect" || s.type === "ellipse") {
      return s.width > 2 || s.height > 2;
    }
    return true;
  }

  private eraseAt(w: { x: number; y: number }): void {
    const hit = this.hitTest(w);
    if (hit) {
      this.commitLocalOp(
        { op: "delete", id: hit.id },
        { op: "add", shape: hit }
      );
    }
  }

  // ---------- Hit testing ----------

  private hitTest(w: { x: number; y: number }): Shape | null {
    const threshold = 6 / this.scale;
    const list = Array.from(this.shapes.values()).reverse(); // topmost first
    for (const s of list) {
      if (this.shapeHit(s, w, threshold)) return s;
    }
    return null;
  }

  private shapeHit(
    s: Shape,
    w: { x: number; y: number },
    t: number
  ): boolean {
    if (s.type === "rect" || s.type === "ellipse") {
      return (
        w.x >= s.x - t &&
        w.x <= s.x + s.width + t &&
        w.y >= s.y - t &&
        w.y <= s.y + s.height + t
      );
    }
    if (s.type === "line" || s.type === "arrow") {
      return this.distToSegment(w, s.x1, s.y1, s.x2, s.y2) <= t + s.strokeWidth;
    }
    if (s.type === "pencil") {
      for (let i = 1; i < s.points.length; i++) {
        const a = s.points[i - 1]!;
        const b = s.points[i]!;
        if (this.distToSegment(w, a.x, a.y, b.x, b.y) <= t + s.strokeWidth)
          return true;
      }
      return false;
    }
    if (s.type === "text") {
      const wdt = s.text.length * s.fontSize * 0.6;
      return (
        w.x >= s.x - t &&
        w.x <= s.x + wdt + t &&
        w.y >= s.y - t &&
        w.y <= s.y + s.fontSize + t
      );
    }
    return false;
  }

  private distToSegment(
    p: { x: number; y: number },
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(p.x - x1, p.y - y1);
    let t = ((p.x - x1) * dx + (p.y - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (x1 + t * dx), p.y - (y1 + t * dy));
  }

  private contentBounds(): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null {
    if (this.shapes.size === 0) return null;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    const acc = (x: number, y: number) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };
    for (const s of this.shapes.values()) {
      if (s.type === "rect" || s.type === "ellipse") {
        acc(s.x, s.y);
        acc(s.x + s.width, s.y + s.height);
      } else if (s.type === "line" || s.type === "arrow") {
        acc(s.x1, s.y1);
        acc(s.x2, s.y2);
      } else if (s.type === "pencil") {
        s.points.forEach((p) => acc(p.x, p.y));
      } else if (s.type === "text") {
        acc(s.x, s.y);
        acc(s.x + s.text.length * s.fontSize * 0.6, s.y + s.fontSize);
      }
    }
    return { minX, minY, maxX, maxY };
  }

  // ---------- Cursor presence ----------

  private maybeSendCursor(w: { x: number; y: number }): void {
    const now = Date.now();
    if (now - this.lastCursorSent < 45) return;
    this.lastCursorSent = now;
    if (this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(
      JSON.stringify({
        type: "cursor",
        roomId: this.roomId,
        x: w.x,
        y: w.y,
        name: this.cursorName,
        color: this.cursorColor,
      })
    );
  }

  private pruneCursors(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, c] of this.remoteCursors) {
      if (now - c.lastSeen > 5000) {
        this.remoteCursors.delete(id);
        changed = true;
      }
    }
    if (changed) this.render();
  }

  // ---------- Text editing ----------

  private openTextEditor(w: { x: number; y: number }): void {
    this.removeTextEditor();
    const screen = this.worldToScreen(w.x, w.y);
    const rect = this.canvas.getBoundingClientRect();
    const ta = document.createElement("textarea");
    ta.style.position = "fixed";
    ta.style.left = `${screen.x + rect.left}px`;
    ta.style.top = `${screen.y + rect.top}px`;
    ta.style.font = `${this.style.fontSize * this.scale}px sans-serif`;
    ta.style.color = this.style.stroke;
    ta.style.background = "transparent";
    ta.style.border = "1px dashed #888";
    ta.style.outline = "none";
    ta.style.resize = "none";
    ta.style.overflow = "hidden";
    ta.style.zIndex = "1000";
    ta.style.minWidth = "120px";
    ta.rows = 1;
    document.body.appendChild(ta);
    ta.focus();
    this.textEditor = ta;

    const commit = () => {
      const value = ta.value.trim();
      if (value) {
        const shape: Shape = {
          id: uid(),
          type: "text",
          x: w.x,
          y: w.y,
          text: value,
          fontSize: this.style.fontSize,
          stroke: this.style.stroke,
          fill: this.style.fill,
          strokeWidth: this.style.strokeWidth,
        };
        this.commitLocalOp(
          { op: "add", shape },
          { op: "delete", id: shape.id }
        );
      }
      this.removeTextEditor();
    };

    ta.addEventListener("blur", commit);
    ta.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        commit();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        ta.value = "";
        this.removeTextEditor();
      }
    });
  }

  private removeTextEditor(): void {
    if (this.textEditor) {
      const ta = this.textEditor;
      this.textEditor = null;
      ta.remove();
    }
  }

  // ---------- Rendering ----------

  render(): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#121212";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);
    for (const s of this.shapes.values()) {
      this.drawShape(ctx, s);
    }
    if (this.draft) this.drawShape(ctx, this.draft);

    if (this.selectedId) {
      const s = this.shapes.get(this.selectedId);
      if (s) this.drawSelection(ctx, s);
    }

    // Cursors are drawn in screen space so they stay a constant size.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const c of this.remoteCursors.values()) {
      this.drawCursor(ctx, c);
    }
  }

  private drawShape(ctx: CanvasRenderingContext2D, s: Shape): void {
    ctx.strokeStyle = s.stroke;
    ctx.lineWidth = s.strokeWidth;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    if (s.type === "rect") {
      if (s.fill !== "transparent") {
        ctx.fillStyle = s.fill;
        ctx.fillRect(s.x, s.y, s.width, s.height);
      }
      ctx.strokeRect(s.x, s.y, s.width, s.height);
    } else if (s.type === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(
        s.x + s.width / 2,
        s.y + s.height / 2,
        Math.abs(s.width / 2),
        Math.abs(s.height / 2),
        0,
        0,
        Math.PI * 2
      );
      if (s.fill !== "transparent") {
        ctx.fillStyle = s.fill;
        ctx.fill();
      }
      ctx.stroke();
    } else if (s.type === "line") {
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    } else if (s.type === "arrow") {
      this.drawArrow(ctx, s.x1, s.y1, s.x2, s.y2);
    } else if (s.type === "pencil") {
      ctx.beginPath();
      s.points.forEach((p, i) =>
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)
      );
      ctx.stroke();
    } else if (s.type === "text") {
      ctx.fillStyle = s.stroke;
      ctx.font = `${s.fontSize}px sans-serif`;
      ctx.textBaseline = "top";
      s.text.split("\n").forEach((line, i) => {
        ctx.fillText(line, s.x, s.y + i * s.fontSize * 1.2);
      });
    }
  }

  private drawArrow(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = 12;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - head * Math.cos(angle - Math.PI / 6),
      y2 - head * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - head * Math.cos(angle + Math.PI / 6),
      y2 - head * Math.sin(angle + Math.PI / 6)
    );
    ctx.stroke();
  }

  private drawSelection(ctx: CanvasRenderingContext2D, s: Shape): void {
    const b = this.shapeBounds(s);
    if (!b) return;
    ctx.save();
    ctx.strokeStyle = "#4dabf7";
    ctx.lineWidth = 1 / this.scale;
    ctx.setLineDash([6 / this.scale, 4 / this.scale]);
    ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
    ctx.restore();
  }

  private shapeBounds(
    s: Shape
  ): { x: number; y: number; w: number; h: number } | null {
    if (s.type === "rect" || s.type === "ellipse") {
      return { x: s.x, y: s.y, w: s.width, h: s.height };
    }
    if (s.type === "line" || s.type === "arrow") {
      return {
        x: Math.min(s.x1, s.x2),
        y: Math.min(s.y1, s.y2),
        w: Math.abs(s.x2 - s.x1),
        h: Math.abs(s.y2 - s.y1),
      };
    }
    if (s.type === "pencil") {
      const xs = s.points.map((p) => p.x);
      const ys = s.points.map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
    }
    if (s.type === "text") {
      return { x: s.x, y: s.y, w: s.text.length * s.fontSize * 0.6, h: s.fontSize };
    }
    return null;
  }

  private drawCursor(ctx: CanvasRenderingContext2D, c: RemoteCursor): void {
    const p = this.worldToScreen(c.x, c.y);
    ctx.save();
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, p.y + 16);
    ctx.lineTo(p.x + 4, p.y + 12);
    ctx.lineTo(p.x + 10, p.y + 18);
    ctx.lineTo(p.x + 12, p.y + 16);
    ctx.lineTo(p.x + 6, p.y + 10);
    ctx.lineTo(p.x + 12, p.y + 10);
    ctx.closePath();
    ctx.fill();

    ctx.font = "12px sans-serif";
    const label = c.name;
    const w = ctx.measureText(label).width;
    ctx.fillStyle = c.color;
    ctx.fillRect(p.x + 12, p.y + 12, w + 10, 18);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, p.x + 17, p.y + 25);
    ctx.restore();
  }

  // ---------- Export ----------

  exportPNG(): void {
    const bounds = this.contentBounds();
    const pad = 24;
    const minX = bounds ? bounds.minX - pad : 0;
    const minY = bounds ? bounds.minY - pad : 0;
    const width = bounds ? bounds.maxX - bounds.minX + pad * 2 : this.canvas.width;
    const height = bounds ? bounds.maxY - bounds.minY + pad * 2 : this.canvas.height;

    const off = document.createElement("canvas");
    off.width = Math.max(1, Math.ceil(width));
    off.height = Math.max(1, Math.ceil(height));
    const octx = off.getContext("2d");
    if (!octx) return;
    octx.fillStyle = "#121212";
    octx.fillRect(0, 0, off.width, off.height);
    octx.setTransform(1, 0, 0, 1, -minX, -minY);
    for (const s of this.shapes.values()) this.drawShape(octx, s);

    const url = off.toDataURL("image/png");
    this.triggerDownload(url, "whitespace-board.png");
  }

  exportSVG(): void {
    const bounds = this.contentBounds();
    const pad = 24;
    const minX = bounds ? bounds.minX - pad : 0;
    const minY = bounds ? bounds.minY - pad : 0;
    const width = bounds ? bounds.maxX - bounds.minX + pad * 2 : 800;
    const height = bounds ? bounds.maxY - bounds.minY + pad * 2 : 600;

    const parts: string[] = [];
    for (const s of this.shapes.values()) {
      parts.push(this.shapeToSvg(s));
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(
      width
    )}" height="${Math.ceil(height)}" viewBox="${minX} ${minY} ${Math.ceil(
      width
    )} ${Math.ceil(height)}"><rect x="${minX}" y="${minY}" width="${Math.ceil(
      width
    )}" height="${Math.ceil(
      height
    )}" fill="#121212"/>${parts.join("")}</svg>`;

    const url =
      "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    this.triggerDownload(url, "whitespace-board.svg");
  }

  private shapeToSvg(s: Shape): string {
    const stroke = `stroke="${s.stroke}" stroke-width="${s.strokeWidth}" fill="${
      s.fill === "transparent" ? "none" : s.fill
    }"`;
    if (s.type === "rect") {
      return `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" ${stroke}/>`;
    }
    if (s.type === "ellipse") {
      return `<ellipse cx="${s.x + s.width / 2}" cy="${
        s.y + s.height / 2
      }" rx="${Math.abs(s.width / 2)}" ry="${Math.abs(s.height / 2)}" ${stroke}/>`;
    }
    if (s.type === "line") {
      return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"/>`;
    }
    if (s.type === "arrow") {
      return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"/>`;
    }
    if (s.type === "pencil") {
      const d = s.points
        .map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`)
        .join(" ");
      return `<path d="${d}" fill="none" stroke="${s.stroke}" stroke-width="${s.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    if (s.type === "text") {
      const escaped = s.text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<text x="${s.x}" y="${s.y + s.fontSize}" font-size="${s.fontSize}" font-family="sans-serif" fill="${s.stroke}">${escaped}</text>`;
    }
    return "";
  }

  private triggerDownload(url: string, filename: string): void {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ---------- Callback emitters ----------

  private emitView(): void {
    this.callbacks.onViewChange?.(Math.round(this.scale * 100));
  }

  private emitHistory(): void {
    this.callbacks.onHistoryChange?.(
      this.undoStack.length > 0,
      this.redoStack.length > 0
    );
  }
}
