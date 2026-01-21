"use client";

import { useEffect, useRef } from "react";
import InitializeCanvas from "@/draw";
import { useTool } from "@/context/ToolContext";
import { IconButton } from "./IconButton";
import { Circle, Pencil, RectangleHorizontalIcon } from "lucide-react";

export default function Canvas({
  roomId,
  socket,
}: {
  roomId: string;
  socket: WebSocket;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ✅ CONTEXT (NO local state)
  const { selectedTool, setSelectedTool, selectedToolRef } = useTool();

  useEffect(() => {
    if (!canvasRef.current) return;

    let cleanup: (() => void) | undefined;

    InitializeCanvas(
      canvasRef.current,
      roomId,
      socket,
      selectedToolRef // 🔥 PASS REF (NOT STATE)
    ).then((result) => {
      cleanup = typeof result === "function" ? result : undefined;
    });

    return () => {
      cleanup?.();
    };
  }, [roomId, socket, selectedToolRef]);

  return (
    <div
      style={{
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        width={window.innerWidth}
        height={window.innerHeight}
      />

      {/* Toolbar */}
      <div
        style={{
          position: "fixed",
          top: "10px",
          left: "10px",
        }}
      >
        <div className="flex gap-2">
          {/* <IconButton
            icon={<Pencil />}
            activated={selectedTool === "pencil"}
            onClick={() => setSelectedTool("pencil")}
          /> */}
          <IconButton
            icon={<RectangleHorizontalIcon />}
            activated={selectedTool === "rect"}
            onClick={() => setSelectedTool("rect")}
          />
          <IconButton
            icon={<Circle />}
            activated={selectedTool === "circle"}
            onClick={() => setSelectedTool("circle")}
          />
        </div>
      </div>
    </div>
  );
}
