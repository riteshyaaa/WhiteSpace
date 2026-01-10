"use client";
import { useEffect, useRef } from "react";

export default function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvasRef.current.getContext("2d");

      if (!ctx) {
        return;
      }

      let drwaing = false;
      let startX = 0;
      let startY = 0;
      addEventListener("mousedown", (e) => {
        drwaing = true;
        startX = e.clientX;
        startY = e.clientY;
      });

      addEventListener("mouseup", (e) => {
        drwaing = false;
        console.log("Mouse up at", e.clientX, e.clientY);
      });
      addEventListener("mousemove", (e) => {
        if (!drwaing) return;

        const width = e.clientX - startX;
        const height = e.clientY - startY;

        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "rgb(0, 0, 0)";

        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "rgb(255, 255, 255)";

        ctx?.strokeRect(startX, startY, width, height);
      });
    }
  }, [canvasRef]);

  return (
    <div>
      <canvas ref={canvasRef} width={2000} height={960}></canvas>
    </div>
  );
}
