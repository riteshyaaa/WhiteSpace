import axios from "axios";
import { BACKEND_URL } from "@/config";
import { getToken } from "@/lib/auth";
import {
  BackgroundMode,
  DEFAULT_STYLE,
  DrawOp,
  GRID_SIZE,
  RemoteCursor,
  Shape,
  STICKY_DEFAULT_FILL,
  StrokeStyle,
  Style,
  Tool,
} from "./types";

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

interface HistoryEntry {
  undo: DrawOp[];
  redo: DrawOp[];
}

export interface EngineCallbacks {
  onToolChange?: (tool: Tool) => void;
  onViewChange?: (zoomPercent: number) => void;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
}

type Mode = "idle" | "drawing" | "panning" | "moving" | "selecting";
type Pt = { x: number; y: number };

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
  private startWorld: Pt = { x: 0, y: 0 };
  private panStart: Pt = { x: 0, y: 0 };
  private panOrigin: Pt = { x: 0, y: 0 };
  private spaceHeld = false;

  private selectedIds = new Set<string>();
  private moveOriginals = new Map<string, Shape>();
  private marquee: { x1: number; y1: number; x2: number; y2: number } | null =
    null;

  private clipboard: Shape[] = [];
  private pasteOffset = 0;

  private background: BackgroundMode = "dots";
  private snapToGrid = false;

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

  // ---------- Public API ----------

  setTool(tool: Tool): void {
    if (this.tool === tool) return;
    this.tool = tool;
    if (tool !== "select") this.clearSelection();
    this.updateCursorStyle();
    this.render();
  }

  setStyle(partial: Partial<Style>): void {
    this.style = { ...this.style, ...partial };
    // Apply style live to every selected shape.
    if (this.selectedIds.size > 0) {
      const redo: DrawOp[] = [];
      const undo: DrawOp[] = [];
      for (const id of this.selectedIds) {
        const shape = this.shapes.get(id);
        if (!shape) continue;
        undo.push({ op: "update", shape: { ...shape } });
        redo.push({
          op: "update",
          shape: {
            ...shape,
            stroke: this.style.stroke,
            fill: this.style.fill,
            strokeWidth: this.style.strokeWidth,
            strokeStyle: this.style.strokeStyle,
          } as Shape,
        });
      }
      if (redo.length) this.commit(redo, undo);
    }
  }

  setBackground(mode: BackgroundMode): void {
    this.background = mode;
    this.render();
  }

  setSnapToGrid(on: boolean): void {
    this.snapToGrid = on;
  }

  setCursorIdentity(name: string, color: string): void {
    this.cursorName = name;
    this.cursorColor = color;
  }

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) return;
    entry.undo.forEach((op) => {
      this.applyOp(op);
      this.broadcastOp(op);
    });
    this.redoStack.push(entry);
    this.render();
    this.emitHistory();
  }

  redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) return;
    entry.redo.forEach((op) => {
      this.applyOp(op);
      this.broadcastOp(op);
    });
    this.undoStack.push(entry);
    this.render();
    this.emitHistory();
  }

  deleteSelected(): void {
    if (this.selectedIds.size === 0) return;
    const redo: DrawOp[] = [];
    const undo: DrawOp[] = [];
    for (const id of this.selectedIds) {
      const shape = this.shapes.get(id);
      if (!shape) continue;
      redo.push({ op: "delete", id });
      undo.push({ op: "add", shape });
    }
    this.clearSelection();
    if (redo.length) this.commit(redo, undo);
    this.render();
  }

  selectAll(): void {
    this.selectedIds = new Set(this.shapes.keys());
    this.render();
  }

  copySelection(): void {
    this.clipboard = this.selectedShapes().map((s) =>
      this.offsetShape(s, 0, 0, s.id)
    );
    this.pasteOffset = 0;
  }

  paste(): void {
    if (this.clipboard.length === 0) return;
    this.pasteOffset += 20;
    const created = this.clipboard.map((s) =>
      this.offsetShape(s, this.pasteOffset, this.pasteOffset, uid())
    );
    const redo: DrawOp[] = created.map((shape) => ({ op: "add", shape }));
    const undo: DrawOp[] = created.map((shape) => ({
      op: "delete",
      id: shape.id,
    }));
    this.commit(redo, undo);
    this.selectedIds = new Set(created.map((s) => s.id));
    this.render();
  }

  duplicate(): void {
    if (this.selectedIds.size === 0) return;
    this.copySelection();
    this.paste();
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

  // ---------- Selection helpers ----------

  private clearSelection(): void {
    this.selectedIds.clear();
    this.moveOriginals.clear();
  }

  private selectedShapes(): Shape[] {
    const out: Shape[] = [];
    for (const id of this.selectedIds) {
      const s = this.shapes.get(id);
      if (s) out.push(s);
    }
    return out;
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
      strokeStyle: ((s.strokeStyle as StrokeStyle) || "solid") as StrokeStyle,
    };
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

  // ---------- Op commit ----------

  private commit(redo: DrawOp[], undo: DrawOp[]): void {
    redo.forEach((op) => this.applyOp(op));
    redo.forEach((op) => this.broadcastOp(op));
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
      this.selectedIds.delete(op.id);
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

  private canvasPoint(e: MouseEvent): Pt {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private screenToWorld(sx: number, sy: number): Pt {
    return {
      x: (sx - this.offsetX) / this.scale,
      y: (sy - this.offsetY) / this.scale,
    };
  }

  private worldToScreen(wx: number, wy: number): Pt {
    return {
      x: wx * this.scale + this.offsetX,
      y: wy * this.scale + this.offsetY,
    };
  }

  private snap(v: number): number {
    return this.snapToGrid ? Math.round(v / GRID_SIZE) * GRID_SIZE : v;
  }

  private snapPoint(p: Pt): Pt {
    return { x: this.snap(p.x), y: this.snap(p.y) };
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
    this.canvas.addEventListener("dblclick", this.onDblClick);
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
    this.canvas.removeEventListener("dblclick", this.onDblClick);
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
      sticky: "copy",
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
      this.createText(this.snapPoint(w));
      return;
    }

    if (this.tool === "sticky") {
      this.createSticky(this.snapPoint(w));
      return;
    }

    if (this.tool === "eraser") {
      this.mode = "drawing";
      this.eraseAt(w);
      return;
    }

    if (this.tool === "select") {
      const hit = this.hitTest(w);
      if (hit) {
        if (e.shiftKey) {
          if (this.selectedIds.has(hit.id)) this.selectedIds.delete(hit.id);
          else this.selectedIds.add(hit.id);
        } else if (!this.selectedIds.has(hit.id)) {
          this.selectedIds = new Set([hit.id]);
        }
        // Begin moving the whole selection.
        if (this.selectedIds.size > 0) {
          this.mode = "moving";
          this.startWorld = w;
          this.moveOriginals.clear();
          for (const id of this.selectedIds) {
            const s = this.shapes.get(id);
            if (s) this.moveOriginals.set(id, { ...s } as Shape);
          }
        }
      } else {
        if (!e.shiftKey) this.clearSelection();
        this.mode = "selecting";
        this.startWorld = w;
        this.marquee = { x1: w.x, y1: w.y, x2: w.x, y2: w.y };
      }
      this.render();
      return;
    }

    // Drawing tools
    this.mode = "drawing";
    this.startWorld = this.snapPoint(w);
    const common = {
      id: uid(),
      stroke: this.style.stroke,
      fill: this.style.fill,
      strokeWidth: this.style.strokeWidth,
      strokeStyle: this.style.strokeStyle,
    };
    if (this.tool === "pencil") {
      this.draft = { ...common, type: "pencil", points: [w] };
    } else if (this.tool === "line") {
      this.draft = {
        ...common,
        type: "line",
        x1: this.startWorld.x,
        y1: this.startWorld.y,
        x2: this.startWorld.x,
        y2: this.startWorld.y,
      };
    } else if (this.tool === "arrow") {
      this.draft = {
        ...common,
        type: "arrow",
        x1: this.startWorld.x,
        y1: this.startWorld.y,
        x2: this.startWorld.x,
        y2: this.startWorld.y,
      };
    } else if (this.tool === "rect") {
      this.draft = {
        ...common,
        type: "rect",
        x: this.startWorld.x,
        y: this.startWorld.y,
        width: 0,
        height: 0,
      };
    } else if (this.tool === "ellipse") {
      this.draft = {
        ...common,
        type: "ellipse",
        x: this.startWorld.x,
        y: this.startWorld.y,
        width: 0,
        height: 0,
      };
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

    if (this.mode === "moving" && this.selectedIds.size > 0) {
      const dx = this.snap(w.x - this.startWorld.x);
      const dy = this.snap(w.y - this.startWorld.y);
      for (const id of this.selectedIds) {
        const shape = this.shapes.get(id);
        const orig = this.moveOriginals.get(id);
        if (shape && orig) this.translateShape(shape, orig, dx, dy);
      }
      this.render();
      return;
    }

    if (this.mode === "selecting" && this.marquee) {
      this.marquee.x2 = w.x;
      this.marquee.y2 = w.y;
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

    if (this.mode === "moving" && this.moveOriginals.size > 0) {
      const redo: DrawOp[] = [];
      const undo: DrawOp[] = [];
      let moved = false;
      for (const [id, orig] of this.moveOriginals) {
        const shape = this.shapes.get(id);
        if (!shape) continue;
        if (JSON.stringify(shape) !== JSON.stringify(orig)) moved = true;
        redo.push({ op: "update", shape: { ...shape } });
        undo.push({ op: "update", shape: orig });
      }
      this.moveOriginals.clear();
      this.mode = "idle";
      if (moved && redo.length) this.commit(redo, undo);
      return;
    }

    if (this.mode === "selecting" && this.marquee) {
      this.selectWithinMarquee();
      this.marquee = null;
      this.mode = "idle";
      this.render();
      return;
    }

    if (this.mode === "drawing" && this.draft) {
      const shape = this.draft;
      this.draft = null;
      this.mode = "idle";
      if (this.isMeaningful(shape)) {
        this.commit([{ op: "add", shape }], [{ op: "delete", id: shape.id }]);
      } else {
        this.render();
      }
      return;
    }

    this.mode = "idle";
  };

  private onDblClick = (e: MouseEvent): void => {
    const sp = this.canvasPoint(e);
    const w = this.screenToWorld(sp.x, sp.y);
    const hit = this.hitTest(w);
    if (hit && (hit.type === "text" || hit.type === "sticky")) {
      this.editShapeText(hit);
    }
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
    if (mod) {
      const k = e.key.toLowerCase();
      if (k === "z") {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
        return;
      }
      if (k === "y") {
        e.preventDefault();
        this.redo();
        return;
      }
      if (k === "a") {
        e.preventDefault();
        this.selectAll();
        return;
      }
      if (k === "c") {
        this.copySelection();
        return;
      }
      if (k === "v") {
        e.preventDefault();
        this.paste();
        return;
      }
      if (k === "d") {
        e.preventDefault();
        this.duplicate();
        return;
      }
      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      if (this.selectedIds.size > 0) {
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
      s: "sticky",
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

  private updateDraft(w: Pt): void {
    const s = this.draft;
    if (!s) return;
    if (s.type === "pencil") {
      s.points.push(w);
    } else if (s.type === "line" || s.type === "arrow") {
      const p = this.snapPoint(w);
      s.x2 = p.x;
      s.y2 = p.y;
    } else if (s.type === "rect" || s.type === "ellipse") {
      const p = this.snapPoint(w);
      s.x = Math.min(this.startWorld.x, p.x);
      s.y = Math.min(this.startWorld.y, p.y);
      s.width = Math.abs(p.x - this.startWorld.x);
      s.height = Math.abs(p.y - this.startWorld.y);
    }
  }

  private translateShape(
    target: Shape,
    original: Shape,
    dx: number,
    dy: number
  ): void {
    if (target.type === "pencil" && original.type === "pencil") {
      target.points = original.points.map((p) => ({
        x: p.x + dx,
        y: p.y + dy,
      }));
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

  private offsetShape(s: Shape, dx: number, dy: number, id: string): Shape {
    if (s.type === "pencil") {
      return { ...s, id, points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    }
    if (s.type === "line" || s.type === "arrow") {
      return { ...s, id, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
    }
    return { ...s, id, x: s.x + dx, y: s.y + dy };
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

  private eraseAt(w: Pt): void {
    const hit = this.hitTest(w);
    if (hit) {
      this.commit([{ op: "delete", id: hit.id }], [{ op: "add", shape: hit }]);
    }
  }

  // ---------- Sticky / text creation ----------

  private createText(w: Pt): void {
    this.openTextInput({
      worldX: w.x,
      worldY: w.y,
      initial: "",
      fontSize: this.style.fontSize,
      color: this.style.stroke,
      onCommit: (text) => {
        const value = text.trim();
        if (!value) return;
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
          strokeStyle: this.style.strokeStyle,
        };
        this.commit([{ op: "add", shape }], [{ op: "delete", id: shape.id }]);
      },
    });
  }

  private createSticky(w: Pt): void {
    const width = 180;
    const height = 140;
    const fill =
      this.style.fill === "transparent" ? STICKY_DEFAULT_FILL : this.style.fill;
    const shape: Shape = {
      id: uid(),
      type: "sticky",
      x: w.x,
      y: w.y,
      width,
      height,
      text: "",
      fontSize: 16,
      stroke: fill,
      fill,
      strokeWidth: 1,
      strokeStyle: "solid",
    };
    this.commit([{ op: "add", shape }], [{ op: "delete", id: shape.id }]);
    this.editShapeText(shape);
  }

  private editShapeText(shape: Shape): void {
    if (shape.type !== "text" && shape.type !== "sticky") return;
    const fontSize = shape.fontSize;
    const widthWorld = shape.type === "sticky" ? shape.width : undefined;
    const before = { ...shape } as Shape;
    this.openTextInput({
      worldX: shape.x,
      worldY: shape.y,
      widthWorld,
      initial: shape.text,
      fontSize,
      color: shape.type === "sticky" ? "#1a1a1a" : shape.stroke,
      onCommit: (text) => {
        const current = this.shapes.get(shape.id);
        if (!current || (current.type !== "text" && current.type !== "sticky"))
          return;
        const value = shape.type === "sticky" ? text : text.trim();
        if (current.type === "text" && !value) {
          // Emptied a text label -> delete it.
          this.commit(
            [{ op: "delete", id: current.id }],
            [{ op: "add", shape: before }]
          );
          return;
        }
        const updated = { ...current, text: value } as Shape;
        this.commit(
          [{ op: "update", shape: updated }],
          [{ op: "update", shape: before }]
        );
      },
    });
  }

  // ---------- Hit testing ----------

  private hitTest(w: Pt): Shape | null {
    const threshold = 6 / this.scale;
    const list = Array.from(this.shapes.values()).reverse();
    for (const s of list) {
      if (this.shapeHit(s, w, threshold)) return s;
    }
    return null;
  }

  private shapeHit(s: Shape, w: Pt, t: number): boolean {
    if (s.type === "rect" || s.type === "ellipse" || s.type === "sticky") {
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
    p: Pt,
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

  private selectWithinMarquee(): void {
    if (!this.marquee) return;
    const mx = Math.min(this.marquee.x1, this.marquee.x2);
    const my = Math.min(this.marquee.y1, this.marquee.y2);
    const mw = Math.abs(this.marquee.x2 - this.marquee.x1);
    const mh = Math.abs(this.marquee.y2 - this.marquee.y1);
    for (const s of this.shapes.values()) {
      const b = this.shapeBounds(s);
      if (!b) continue;
      const overlap =
        b.x < mx + mw && b.x + b.w > mx && b.y < my + mh && b.y + b.h > my;
      if (overlap) this.selectedIds.add(s.id);
    }
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
    for (const s of this.shapes.values()) {
      const b = this.shapeBounds(s);
      if (!b) continue;
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }
    if (minX === Infinity) return null;
    return { minX, minY, maxX, maxY };
  }

  // ---------- Cursor presence ----------

  private maybeSendCursor(w: Pt): void {
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

  // ---------- Text editing overlay ----------

  private openTextInput(params: {
    worldX: number;
    worldY: number;
    widthWorld?: number;
    initial: string;
    fontSize: number;
    color: string;
    onCommit: (text: string) => void;
  }): void {
    this.removeTextEditor();
    const screen = this.worldToScreen(params.worldX, params.worldY);
    const rect = this.canvas.getBoundingClientRect();
    const ta = document.createElement("textarea");
    ta.value = params.initial;
    ta.style.position = "fixed";
    ta.style.left = `${screen.x + rect.left}px`;
    ta.style.top = `${screen.y + rect.top}px`;
    ta.style.font = `${params.fontSize * this.scale}px sans-serif`;
    ta.style.color = params.color;
    ta.style.background = "rgba(255,255,255,0.04)";
    ta.style.border = "1px dashed #888";
    ta.style.outline = "none";
    ta.style.resize = "none";
    ta.style.overflow = "hidden";
    ta.style.zIndex = "1000";
    ta.style.padding = "2px";
    if (params.widthWorld) {
      ta.style.width = `${params.widthWorld * this.scale}px`;
    } else {
      ta.style.minWidth = "120px";
    }
    ta.rows = 1;
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    this.textEditor = ta;

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      const value = ta.value;
      this.removeTextEditor();
      params.onCommit(value);
    };

    ta.addEventListener("blur", commit);
    ta.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        commit();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        committed = true;
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
    this.drawBackground(ctx);

    ctx.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);
    for (const s of this.shapes.values()) {
      this.drawShape(ctx, s);
    }
    if (this.draft) this.drawShape(ctx, this.draft);

    for (const id of this.selectedIds) {
      const s = this.shapes.get(id);
      if (s) this.drawSelection(ctx, s);
    }
    if (this.marquee) this.drawMarquee(ctx);

    // Screen-space overlays.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const c of this.remoteCursors.values()) {
      this.drawCursor(ctx, c);
    }
    this.drawMinimap(ctx);
  }

  private drawBackground(ctx: CanvasRenderingContext2D): void {
    if (this.background === "blank") return;
    const step = GRID_SIZE * this.scale;
    if (step < 6) return;
    const startX = ((this.offsetX % step) + step) % step;
    const startY = ((this.offsetY % step) + step) % step;
    const { width, height } = this.canvas;

    if (this.background === "grid") {
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = startX; x < width; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = startY; y < height; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      for (let x = startX; x < width; x += step) {
        for (let y = startY; y < height; y += step) {
          ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
        }
      }
    }
  }

  private applyDash(ctx: CanvasRenderingContext2D, s: Shape): void {
    const w = s.strokeWidth;
    if (s.strokeStyle === "dashed") ctx.setLineDash([w * 4, w * 2]);
    else if (s.strokeStyle === "dotted") ctx.setLineDash([Math.max(0.5, w), w * 2]);
    else ctx.setLineDash([]);
  }

  private drawShape(ctx: CanvasRenderingContext2D, s: Shape): void {
    ctx.strokeStyle = s.stroke;
    ctx.lineWidth = s.strokeWidth;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    this.applyDash(ctx, s);

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
      ctx.setLineDash([]);
      ctx.fillStyle = s.stroke;
      ctx.font = `${s.fontSize}px sans-serif`;
      ctx.textBaseline = "top";
      s.text.split("\n").forEach((line, i) => {
        ctx.fillText(line, s.x, s.y + i * s.fontSize * 1.2);
      });
    } else if (s.type === "sticky") {
      this.drawSticky(ctx, s);
    }
    ctx.setLineDash([]);
  }

  private drawSticky(
    ctx: CanvasRenderingContext2D,
    s: Extract<Shape, { type: "sticky" }>
  ): void {
    ctx.setLineDash([]);
    ctx.fillStyle = s.fill === "transparent" ? STICKY_DEFAULT_FILL : s.fill;
    ctx.fillRect(s.x, s.y, s.width, s.height);
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(s.x, s.y, s.width, s.height);

    if (!s.text) return;
    const pad = 10;
    ctx.fillStyle = "#1a1a1a";
    ctx.font = `${s.fontSize}px sans-serif`;
    ctx.textBaseline = "top";
    const lines = this.wrapText(ctx, s.text, s.width - pad * 2);
    const lineHeight = s.fontSize * 1.25;
    lines.forEach((line, i) => {
      const yy = s.y + pad + i * lineHeight;
      if (yy + lineHeight <= s.y + s.height) {
        ctx.fillText(line, s.x + pad, yy);
      }
    });
  }

  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number
  ): string[] {
    const lines: string[] = [];
    for (const para of text.split("\n")) {
      const words = para.split(" ");
      let line = "";
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      lines.push(line);
    }
    return lines;
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
    ctx.setLineDash([]);
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

  private drawMarquee(ctx: CanvasRenderingContext2D): void {
    if (!this.marquee) return;
    const x = Math.min(this.marquee.x1, this.marquee.x2);
    const y = Math.min(this.marquee.y1, this.marquee.y2);
    const w = Math.abs(this.marquee.x2 - this.marquee.x1);
    const h = Math.abs(this.marquee.y2 - this.marquee.y1);
    ctx.save();
    ctx.fillStyle = "rgba(77,171,247,0.12)";
    ctx.strokeStyle = "#4dabf7";
    ctx.lineWidth = 1 / this.scale;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  private shapeBounds(
    s: Shape
  ): { x: number; y: number; w: number; h: number } | null {
    if (s.type === "rect" || s.type === "ellipse" || s.type === "sticky") {
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
      return {
        x: minX,
        y: minY,
        w: Math.max(...xs) - minX,
        h: Math.max(...ys) - minY,
      };
    }
    if (s.type === "text") {
      return {
        x: s.x,
        y: s.y,
        w: s.text.length * s.fontSize * 0.6,
        h: s.fontSize,
      };
    }
    return null;
  }

  private drawCursor(ctx: CanvasRenderingContext2D, c: RemoteCursor): void {
    const p = this.worldToScreen(c.x, c.y);
    ctx.save();
    ctx.setLineDash([]);
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

  private drawMinimap(ctx: CanvasRenderingContext2D): void {
    const bounds = this.contentBounds();
    if (!bounds) return;

    const mmW = 180;
    const mmH = 120;
    const margin = 12;
    const mmX = this.canvas.width - mmW - margin;
    const mmY = this.canvas.height - mmH - margin;

    // World region = content unioned with the current viewport.
    const vpTopLeft = this.screenToWorld(0, 0);
    const vpBotRight = this.screenToWorld(this.canvas.width, this.canvas.height);
    const wMinX = Math.min(bounds.minX, vpTopLeft.x);
    const wMinY = Math.min(bounds.minY, vpTopLeft.y);
    const wMaxX = Math.max(bounds.maxX, vpBotRight.x);
    const wMaxY = Math.max(bounds.maxY, vpBotRight.y);
    const worldW = wMaxX - wMinX || 1;
    const worldH = wMaxY - wMinY || 1;
    const s = Math.min(mmW / worldW, mmH / worldH) * 0.9;
    const padX = (mmW - worldW * s) / 2;
    const padY = (mmH - worldH * s) / 2;
    const toMM = (x: number, y: number) => ({
      x: mmX + padX + (x - wMinX) * s,
      y: mmY + padY + (y - wMinY) * s,
    });

    ctx.save();
    ctx.fillStyle = "rgba(20,20,20,0.85)";
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.fillRect(mmX, mmY, mmW, mmH);
    ctx.strokeRect(mmX, mmY, mmW, mmH);

    ctx.beginPath();
    ctx.rect(mmX, mmY, mmW, mmH);
    ctx.clip();

    ctx.fillStyle = "rgba(255,255,255,0.55)";
    for (const shape of this.shapes.values()) {
      const b = this.shapeBounds(shape);
      if (!b) continue;
      const tl = toMM(b.x, b.y);
      ctx.fillRect(tl.x, tl.y, Math.max(1, b.w * s), Math.max(1, b.h * s));
    }

    // Viewport rectangle.
    const vTL = toMM(vpTopLeft.x, vpTopLeft.y);
    const vBR = toMM(vpBotRight.x, vpBotRight.y);
    ctx.strokeStyle = "#4dabf7";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vTL.x, vTL.y, vBR.x - vTL.x, vBR.y - vTL.y);
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
    )}" height="${Math.ceil(height)}" fill="#121212"/>${parts.join("")}</svg>`;

    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    this.triggerDownload(url, "whitespace-board.svg");
  }

  private dashArray(s: Shape): string {
    const w = s.strokeWidth;
    if (s.strokeStyle === "dashed") return ` stroke-dasharray="${w * 4} ${w * 2}"`;
    if (s.strokeStyle === "dotted")
      return ` stroke-dasharray="${Math.max(0.5, w)} ${w * 2}" stroke-linecap="round"`;
    return "";
  }

  private shapeToSvg(s: Shape): string {
    const dash = this.dashArray(s);
    const stroke = `stroke="${s.stroke}" stroke-width="${s.strokeWidth}" fill="${
      s.fill === "transparent" ? "none" : s.fill
    }"${dash}`;
    if (s.type === "rect") {
      return `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" ${stroke}/>`;
    }
    if (s.type === "ellipse") {
      return `<ellipse cx="${s.x + s.width / 2}" cy="${
        s.y + s.height / 2
      }" rx="${Math.abs(s.width / 2)}" ry="${Math.abs(s.height / 2)}" ${stroke}/>`;
    }
    if (s.type === "line") {
      return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"${dash}/>`;
    }
    if (s.type === "arrow") {
      return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"${dash}/>`;
    }
    if (s.type === "pencil") {
      const d = s.points
        .map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`)
        .join(" ");
      return `<path d="${d}" fill="none" stroke="${s.stroke}" stroke-width="${s.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
    }
    if (s.type === "sticky") {
      const bg = s.fill === "transparent" ? STICKY_DEFAULT_FILL : s.fill;
      const escaped = this.escapeXml(s.text);
      return `<g><rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" fill="${bg}" stroke="rgba(0,0,0,0.18)"/><text x="${
        s.x + 10
      }" y="${s.y + 10 + s.fontSize}" font-size="${s.fontSize}" font-family="sans-serif" fill="#1a1a1a">${escaped}</text></g>`;
    }
    if (s.type === "text") {
      const escaped = this.escapeXml(s.text);
      return `<text x="${s.x}" y="${s.y + s.fontSize}" font-size="${s.fontSize}" font-family="sans-serif" fill="${s.stroke}">${escaped}</text>`;
    }
    return "";
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
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
