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
  Database,
  Sparkles,
  Smile,
  MonitorPlay,
  MessageSquare,
  Eye,
  LayoutGrid,
  Command as CommandIcon,
  Sun,
  Moon,
  Contrast,
} from "lucide-react";
import { CanvasEngine } from "@/draw/engine";
import {
  BackgroundMode,
  DEFAULT_STYLE,
  Style,
  StrokeStyle,
  ThemeName,
  THEMES,
  Tool,
} from "@/draw/types";
import { getMe, colorFromId } from "@/lib/user";
import { CommandPalette, Command } from "./CommandPalette";

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
    { tool: "laser", icon: <Sparkles size={18} />, label: "Laser pointer", key: "X" },
  ];

const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥", "👀", "✅", "❓"];

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
  const [erdOpen, setErdOpen] = useState(false);
  const [schemaText, setSchemaText] = useState("");
  const [erdError, setErdError] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [presenter, setPresenter] = useState<{ userId: string; name: string } | null>(null);
  const [following, setFollowingState] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeName>(() => {
    if (typeof window === "undefined") return "dark";
    return (window.localStorage.getItem("ws_theme") as ThemeName) || "dark";
  });
  const prevThemeRef = useRef<ThemeName>("dark");

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
      onPresenterChange: (p) => {
        setPresenter(p);
        setFollowingState(engineRef.current?.isFollowing() ?? false);
      },
    });
    engineRef.current = engine;
    engine.setBackground(background);
    engine.setSnapToGrid(snap);
    engine.setTheme(theme);
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

  // Apply theme; adapt the default stroke color so new shapes stay visible.
  useEffect(() => {
    engineRef.current?.setTheme(theme);
    const prev = prevThemeRef.current;
    if (prev !== theme) {
      setStyle((s) =>
        s.stroke === THEMES[prev].defaultStroke
          ? { ...s, stroke: THEMES[theme].defaultStroke }
          : s
      );
      prevThemeRef.current = theme;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ws_theme", theme);
    }
  }, [theme]);

  // Command palette: Cmd/Ctrl-K toggles it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const cycleTheme = () =>
    setTheme((t) => (t === "dark" ? "light" : t === "light" ? "contrast" : "dark"));

  const cycleBackground = () => {
    setBackground((b) => (b === "dots" ? "grid" : b === "grid" ? "blank" : "dots"));
  };

  const handleGenerateErd = () => {
    const count = engineRef.current?.generateERD(schemaText) ?? 0;
    if (count > 0) {
      setErdOpen(false);
      setSchemaText("");
      setErdError(null);
    } else {
      setErdError("No Prisma `model` blocks found. Paste a valid schema.prisma.");
    }
  };

  const togglePresenting = () => {
    const next = !presenting;
    setPresenting(next);
    engineRef.current?.setPresenting(next);
  };

  const toggleFollow = () => {
    if (!presenter) return;
    const next = !following;
    engineRef.current?.setFollowing(next ? presenter.userId : null);
    setFollowingState(next);
  };

  const sendReaction = (emoji: string) => {
    engineRef.current?.sendReaction(emoji);
    setReactionsOpen(false);
  };

  const e = () => engineRef.current;
  const commands: Command[] = [
    ...TOOLS.map((t) => ({
      id: `tool-${t.tool}`,
      group: "Tool",
      label: t.label,
      hint: t.key,
      keywords: "tool draw",
      run: () => setTool(t.tool),
    })),
    { id: "undo", group: "Edit", label: "Undo", hint: "Ctrl+Z", run: () => e()?.undo() },
    { id: "redo", group: "Edit", label: "Redo", hint: "Ctrl+Shift+Z", run: () => e()?.redo() },
    { id: "selectAll", group: "Edit", label: "Select all", hint: "Ctrl+A", run: () => e()?.selectAll() },
    { id: "duplicate", group: "Edit", label: "Duplicate selection", hint: "Ctrl+D", run: () => e()?.duplicate() },
    { id: "delete", group: "Edit", label: "Delete selection", hint: "Del", run: () => e()?.deleteSelected() },
    { id: "zoomIn", group: "View", label: "Zoom in", run: () => e()?.zoomIn() },
    { id: "zoomOut", group: "View", label: "Zoom out", run: () => e()?.zoomOut() },
    { id: "zoomReset", group: "View", label: "Reset zoom", run: () => e()?.resetView() },
    { id: "zoomFit", group: "View", label: "Fit to content", run: () => e()?.zoomToFit() },
    { id: "bg", group: "View", label: "Cycle background (blank/grid/dots)", run: cycleBackground },
    { id: "snap", group: "View", label: "Toggle snap to grid", keywords: "magnet", run: () => setSnap((s) => !s) },
    { id: "theme-dark", group: "Theme", label: "Theme: Dark", run: () => setTheme("dark") },
    { id: "theme-light", group: "Theme", label: "Theme: Light", run: () => setTheme("light") },
    { id: "theme-contrast", group: "Theme", label: "Theme: High contrast", keywords: "accessibility a11y", run: () => setTheme("contrast") },
    { id: "png", group: "Export", label: "Export as PNG", run: () => e()?.exportPNG() },
    { id: "svg", group: "Export", label: "Export as SVG", run: () => e()?.exportSVG() },
    { id: "erd", group: "Insert", label: "Generate ERD from Prisma schema", keywords: "database diagram", run: () => setErdOpen(true) },
    { id: "present", group: "Collab", label: presenting ? "Stop presenting" : "Present (broadcast view)", run: togglePresenting },
    { id: "chat", group: "Collab", label: "Cursor chat", hint: "/", run: () => e()?.openCursorChat() },
    { id: "react", group: "Collab", label: "React with emoji", run: () => setReactionsOpen(true) },
  ];

  return (
    <div style={{ height: "100vh", overflow: "hidden", position: "relative" }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block" }}
        aria-label="Whiteboard canvas"
        role="img"
      />

      {/* Command palette */}
      <CommandPalette
        open={paletteOpen}
        commands={commands}
        onClose={() => setPaletteOpen(false)}
      />

      {/* Back to dashboard */}
      <a
        href="/dashboard"
        title="Back to boards"
        className="fixed left-3 top-3 z-[1200] flex h-9 items-center gap-1 rounded-xl bg-zinc-800/95 px-3 text-sm text-zinc-300 shadow-lg backdrop-blur hover:bg-zinc-700"
      >
        <LayoutGrid size={16} /> Boards
      </a>

      {/* Tool palette */}
      <div
        role="toolbar"
        aria-label="Drawing tools"
        className="fixed left-1/2 top-3 -translate-x-1/2 flex items-center gap-1 rounded-xl bg-zinc-800/95 p-1.5 shadow-lg backdrop-blur"
      >
        {TOOLS.map((t) => (
          <button
            key={t.tool}
            title={`${t.label} (${t.key})`}
            aria-label={t.label}
            aria-pressed={tool === t.tool}
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
        <div className="mx-1 h-6 w-px bg-zinc-600" />
        <button
          title="Generate ERD from a Prisma schema"
          onClick={() => setErdOpen(true)}
          className="flex h-9 items-center gap-1 rounded-lg px-2 text-zinc-300 hover:bg-zinc-700"
        >
          <Database size={16} /> ERD
        </button>
        <div className="mx-1 h-6 w-px bg-zinc-600" />
        <button
          title={presenting ? "Stop presenting" : "Present (broadcast your view)"}
          onClick={togglePresenting}
          className={`flex h-9 items-center gap-1 rounded-lg px-2 ${
            presenting
              ? "bg-blue-600 text-white"
              : "text-zinc-300 hover:bg-zinc-700"
          }`}
        >
          <MonitorPlay size={16} /> {presenting ? "Presenting" : "Present"}
        </button>
        <div className="mx-1 h-6 w-px bg-zinc-600" />
        <button
          aria-label={`Theme: ${theme}. Click to change.`}
          title={`Theme: ${theme} (click to cycle)`}
          onClick={cycleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 hover:bg-zinc-700"
        >
          {theme === "dark" ? (
            <Moon size={18} />
          ) : theme === "light" ? (
            <Sun size={18} />
          ) : (
            <Contrast size={18} />
          )}
        </button>
        <button
          aria-label="Open command palette"
          title="Command palette (Ctrl/Cmd+K)"
          onClick={() => setPaletteOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 hover:bg-zinc-700"
        >
          <CommandIcon size={18} />
        </button>
      </div>

      {/* Follow-presenter banner */}
      {presenter && (
        <div className="fixed left-1/2 top-16 z-[1200] flex -translate-x-1/2 items-center gap-3 rounded-xl bg-zinc-800/95 px-4 py-2 text-sm text-zinc-200 shadow-lg backdrop-blur">
          <span className="flex items-center gap-1.5">
            <MonitorPlay size={15} className="text-blue-400" />
            <strong>{presenter.name}</strong> is presenting
          </span>
          <button
            onClick={toggleFollow}
            className={`flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-medium ${
              following
                ? "bg-blue-600 text-white"
                : "bg-zinc-700 text-zinc-200 hover:bg-zinc-600"
            }`}
          >
            <Eye size={14} /> {following ? "Following" : "Follow"}
          </button>
        </div>
      )}

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

      {/* Collaboration pill (bottom center) */}
      <div className="fixed bottom-3 left-1/2 z-[1200] flex -translate-x-1/2 items-center gap-1 rounded-xl bg-zinc-800/95 p-1.5 text-zinc-300 shadow-lg backdrop-blur">
        <div className="relative">
          {reactionsOpen && (
            <div className="absolute bottom-11 left-1/2 flex -translate-x-1/2 gap-1 rounded-xl bg-zinc-800 p-2 shadow-lg">
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => sendReaction(emoji)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-xl hover:bg-zinc-700"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
          <button
            title="React"
            onClick={() => setReactionsOpen((o) => !o)}
            className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-zinc-700 ${
              reactionsOpen ? "bg-zinc-700 text-white" : ""
            }`}
          >
            <Smile size={16} />
          </button>
        </div>
        <button
          title="Cursor chat (press /)"
          onClick={() => engineRef.current?.openCursorChat()}
          className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs hover:bg-zinc-700"
        >
          <MessageSquare size={15} /> Chat
        </button>
      </div>

      {/* ERD generator modal */}
      {erdOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4">
          <div className="flex w-full max-w-2xl flex-col gap-3 rounded-2xl bg-zinc-900 p-5 text-zinc-200 shadow-2xl">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <Database size={18} /> Schema → ERD
            </div>
            <p className="text-xs text-zinc-400">
              Paste a <code className="text-zinc-300">schema.prisma</code>. Each{" "}
              <code className="text-zinc-300">model</code> becomes an editable
              entity; <code className="text-zinc-300">@relation</code> fields become
              connections. The generated shapes are normal canvas objects you can
              move and restyle.
            </p>
            <textarea
              value={schemaText}
              onChange={(e) => setSchemaText(e.target.value)}
              spellCheck={false}
              placeholder={`model User {\n  id    String @id @default(uuid())\n  email String @unique\n  posts Post[]\n}\n\nmodel Post {\n  id       Int    @id @default(autoincrement())\n  title    String\n  author   User   @relation(fields: [authorId], references: [id])\n  authorId String\n}`}
              className="h-64 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-950 p-3 font-mono text-xs text-zinc-100 outline-none focus:border-blue-500"
            />
            {erdError && <p className="text-sm text-red-400">{erdError}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setErdOpen(false);
                  setErdError(null);
                }}
                className="rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateErd}
                disabled={!schemaText.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              >
                Generate ERD
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
