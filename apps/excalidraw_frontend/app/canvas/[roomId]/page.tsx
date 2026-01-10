"use client";
import InitializeCanvas from "@/draw";
import { useEffect, useRef } from "react";

export default function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      InitializeCanvas(canvas)
     
    }
  }, [canvasRef]);

  return (
    <div>
      <canvas ref={canvasRef} width={2000} height={960}></canvas>
    </div>
  );
}
