"use client";

import { useEffect, useRef, useState } from "react";
import {
  MousePointer2,
  Hand,
  Pencil,
  Minus,
  MoveUpRight,
  Square,
  Circle,
  Type,
  StickyNote,
  Eraser,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Download,
  Grid3x3,
  Magnet,
} from "lucide-react";
import { CanvasEngine } from "@/draw/engine";
import {
  BackgroundMode,
  DEFAULT_STYLE,
  Style,
  StrokeStyle,
  Tool,
} from "@/draw/types";
import { getMe, colorFromId } from "@/lib/user";

const TOOLS: { tool: Tool; icon: React.ReactNode; label: string; key: string }[] =
  [
    { tool: "select", icon: <MousePointer2 size={18} />, label: "Select", key: "V" },
    { tool: "hand", icon: <Hand size={18} />, label: "Pan", key: "H" },
    { tool: "pencil", icon: <Pencil size={18} />, label: "Pencil", key: "P" },
    { tool: "line", icon: <Minus size={18} />, label: "Line", key: "L" },
    { tool: "arrow", icon: <MoveUpRight size={18} />, label: "Arrow", key: "A" },
    { tool: "rect", icon: <Square size={18} />, label: "Rectangle", key: "R" },
    { tool: "ellipse", icon: <Circle size={18} />, label: "Ellipse", key: "O" },
    { tool: "text", icon: <Type size={18} />, label: "Text", key: "T" },
    { tool: "sticky", icon: <StickyNote size={18} />, label: "Sticky note", key: "S" },
    { tool: "eraser", icon: <Eraser size={18} />, label: "Eraser", key: "E" },
  ];

const STROKE_COLORS = ["#f8f9fa", "#ff6b6b", "#51cf66", "#4dabf7", "#ffd43b", "#cc5de8"];
const FILL_COLORS = ["transparent", "#ff6b6b", "#51cf66", "#4dabf7", "#ffd43b", "#cc5de8"];
const STROKE_STYLES: { value: StrokeStyle; label: string }[] = [
  { value: "solid", label: "──" },
  { value: "dashed", label: "- -" },
  { value: "dotted", label: "···" },
];

export default function Canvas({
  roomId,
  socket,
}: {
  roomId: string;
  socket: WebSocket;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CanvasEngine | null>(null);

  const [tool, setTool] = useState<Tool>("select");
  const [style, setStyle] = useState<Style>({ ...DEFAULT_STYLE });
  const [zoom, setZoom] = useState(100);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [background, setBackground] = useState<BackgroundMode>("dots");
  const [snap, setSnap] = useState(false);

  // Create the engine once per (room, socket).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      engineRef.current?.render();
    };
    resize();

    const engine = new CanvasEngine(canvas, roomId, socket, {
      onToolChange: (t) => setTool(t),
      onViewChange: (z) => setZoom(z),
      onHistoryChange: (u, r) => {
        setCanUndo(u);
        setCanRedo(r);
      },
    });
    engineRef.current = engine;
    engine.setBackground(background);
    engine.setSnapToGrid(snap);
    engine.init();

    getMe().then((me) => {
      if (me) engine.setCursorIdentity(me.name || "Anonymous", colorFromId(me.id));
    });

    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, socket]);

  useEffect(() => {
    engineRef.current?.setTool(tool);
  }, [tool]);

  useEffect(() => {
    engineRef.current?.setStyle(style);
  }, [style]);

  useEffect(() => {
    engineRef.current?.setBackground(background);
  }, [background]);

  useEffect(() => {
    engineRef.current?.setSnapToGrid(snap);
  }, [snap]);

  const cycleBackground = () => {
    setBackground((b) => (b === "dots" ? "grid" : b === "grid" ? "blank" : "dots"));
  };

  return (
    <div style={{ height: "100vh", overflow: "hidden", position: "relative" }}>
      <canvas ref={canvasRef} style={{ display: "block" }} />

      {/* Tool palette */}
      <div className="fixed left-1/2 top-3 -translate-x-1/2 flex items-center gap-1 rounded-xl bg-zinc-800/95 p-1.5 shadow-lg backdrop-blur">
        {TOOLS.map((t) => (
          <button
            key={t.tool}
            title={`${t.label} (${t.key})`}
            onClick={() => setTool(t.tool)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
              tool === t.tool
                ? "bg-blue-600 text-white"
                : "text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            {t.icon}
          </button>
        ))}
      </div>

      {/* Properties panel */}
      <div className="fixed left-3 top-20 flex w-44 flex-col gap-3 rounded-xl bg-zinc-800/95 p-3 text-xs text-zinc-300 shadow-lg backdrop-blur">
        <div>
          <div className="mb-1 font-medium text-zinc-400">Stroke</div>
          <div className="flex flex-wrap gap-1">
            {STROKE_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setStyle((s) => ({ ...s, stroke: c }))}
                className={`h-6 w-6 rounded border ${
                  style.stroke === c ? "border-blue-400" : "border-zinc-600"
                }`}
                style={{ background: c }}
              />
            ))}
            <input
              type="color"
              value={style.stroke}
              onChange={(e) => setStyle((s) => ({ ...s, stroke: e.target.value }))}
              className="h-6 w-6 cursor-pointer rounded border border-zinc-600 bg-transparent"
            />
          </div>
        </div>

        <div>
          <div className="mb-1 font-medium text-zinc-400">Fill</div>
          <div className="flex flex-wrap gap-1">
            {FILL_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setStyle((s) => ({ ...s, fill: c }))}
                title={c === "transparent" ? "No fill" : c}
                className={`flex h-6 w-6 items-center justify-center rounded border text-[10px] ${
                  style.fill === c ? "border-blue-400" : "border-zinc-600"
                }`}
                style={{ background: c === "transparent" ? "transparent" : c }}
              >
                {c === "transparent" ? "∅" : ""}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 font-medium text-zinc-400">Stroke style</div>
          <div className="flex gap-1">
            {STROKE_STYLES.map((ss) => (
              <button
                key={ss.value}
                onClick={() => setStyle((s) => ({ ...s, strokeStyle: ss.value }))}
                className={`flex-1 rounded border py-1 font-mono ${
                  style.strokeStyle === ss.value
                    ? "border-blue-400 bg-zinc-700 text-white"
                    : "border-zinc-600 hover:bg-zinc-700"
                }`}
              >
                {ss.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 font-medium text-zinc-400">
            Stroke width: {style.strokeWidth}
          </div>
          <input
            type="range"
            min={1}
            max={20}
            value={style.strokeWidth}
            onChange={(e) =>
              setStyle((s) => ({ ...s, strokeWidth: Number(e.target.value) }))
            }
            className="w-full"
          />
        </div>

        <div>
          <div className="mb-1 font-medium text-zinc-400">
            Font size: {style.fontSize}
          </div>
          <input
            type="range"
            min={10}
            max={72}
            value={style.fontSize}
            onChange={(e) =>
              setStyle((s) => ({ ...s, fontSize: Number(e.target.value) }))
            }
            className="w-full"
          />
        </div>
      </div>

      {/* History + export (top right) */}
      <div className="fixed right-3 top-3 flex items-center gap-1 rounded-xl bg-zinc-800/95 p-1.5 shadow-lg backdrop-blur">
        <button
          title="Undo (Ctrl+Z)"
          disabled={!canUndo}
          onClick={() => engineRef.current?.undo()}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 hover:bg-zinc-700 disabled:opacity-30"
        >
          <Undo2 size={18} />
        </button>
        <button
          title="Redo (Ctrl+Shift+Z)"
          disabled={!canRedo}
          onClick={() => engineRef.current?.redo()}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 hover:bg-zinc-700 disabled:opacity-30"
        >
          <Redo2 size={18} />
        </button>
        <div className="mx-1 h-6 w-px bg-zinc-600" />
        <button
          title="Export PNG"
          onClick={() => engineRef.current?.exportPNG()}
          className="flex h-9 items-center gap-1 rounded-lg px-2 text-zinc-300 hover:bg-zinc-700"
        >
          <Download size={16} /> PNG
        </button>
        <button
          title="Export SVG"
          onClick={() => engineRef.current?.exportSVG()}
          className="flex h-9 items-center gap-1 rounded-lg px-2 text-zinc-300 hover:bg-zinc-700"
        >
          <Download size={16} /> SVG
        </button>
      </div>

      {/* Zoom + canvas aids (bottom left) */}
      <div className="fixed bottom-3 left-3 flex items-center gap-1 rounded-xl bg-zinc-800/95 p-1.5 text-zinc-300 shadow-lg backdrop-blur">
        <button
          title="Zoom out"
          onClick={() => engineRef.current?.zoomOut()}
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-zinc-700"
        >
          <ZoomOut size={16} />
        </button>
        <button
          title="Reset zoom"
          onClick={() => engineRef.current?.resetView()}
          className="w-14 rounded-lg py-1 text-center text-xs hover:bg-zinc-700"
        >
          {zoom}%
        </button>
        <button
          title="Zoom in"
          onClick={() => engineRef.current?.zoomIn()}
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-zinc-700"
        >
          <ZoomIn size={16} />
        </button>
        <div className="mx-1 h-5 w-px bg-zinc-600" />
        <button
          title="Fit to content"
          onClick={() => engineRef.current?.zoomToFit()}
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-zinc-700"
        >
          <Maximize size={16} />
        </button>
        <button
          title={`Background: ${background} (click to cycle)`}
          onClick={cycleBackground}
          className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-zinc-700 ${
            background !== "blank" ? "text-blue-400" : ""
          }`}
        >
          <Grid3x3 size={16} />
        </button>
        <button
          title="Snap to grid"
          onClick={() => setSnap((s) => !s)}
          className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-zinc-700 ${
            snap ? "bg-blue-600 text-white" : ""
          }`}
        >
          <Magnet size={16} />
        </button>
      </div>
    </div>
  );
}
