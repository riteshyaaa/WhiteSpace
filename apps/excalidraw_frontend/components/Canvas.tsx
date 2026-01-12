"use client";
import { WS_URL } from "@/config";
import InitializeCanvas from "@/draw";
import { useEffect, useRef } from "react";

export default function Canvas({roomId, socket}: {roomId: string, socket: WebSocket}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  

  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      InitializeCanvas(canvas, roomId,socket)
     
    }
  }, [canvasRef, roomId]);


  return (
    <div>
      <canvas ref={canvasRef} width={2000} height={960}></canvas>
    </div>
  );
}
