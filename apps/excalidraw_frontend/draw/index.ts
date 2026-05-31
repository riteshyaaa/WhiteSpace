import { BACKEND_URL } from "@/config";
import { getToken } from "@/lib/auth";
import axios from "axios";
import { MutableRefObject } from "react";
import { Tool } from "@/context/ToolContext";

type Shape =
  | {
      type: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      type: "circle";
      centerX: number;
      centerY: number;
      radius: number;
    };

export default async function InitializeCanvas(
  canvas: HTMLCanvasElement,
  roomId: string,
  socket: WebSocket,
  selectedToolRef: MutableRefObject<Tool>,
): Promise<() => void> {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return () => {};
  }

  const existingShapes: Shape[] = await getExistingShapes(roomId);

  const handleSocketMessage = (event: MessageEvent) => {
    const message = JSON.parse(event.data);

    if (message.type == "chat") {
      const parsedData = JSON.parse(message.message);
      const shape = parsedData.shape;
      existingShapes.push(shape);
      clearCanvas(existingShapes, canvas, ctx);
    }
  };

  // addEventListener (not socket.onmessage) so we don't clobber other handlers.
  socket.addEventListener("message", handleSocketMessage);

  clearCanvas(existingShapes, canvas, ctx);

  let drawing = false;
  let startX = 0;
  let startY = 0;

  const handleMouseDown = (e: MouseEvent) => {
    drawing = true;
    const rect = canvas.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
  };

  const handleMouseUp = (e: MouseEvent) => {
    if (!drawing) return;
    drawing = false;

    const rect = canvas.getBoundingClientRect();
    const width = e.clientX - rect.left - startX;
    const height = e.clientY - rect.top - startY;

    let shape: Shape;
    if (selectedToolRef.current === "rect") {
      shape = {
        type: "rect",
        x: startX,
        y: startY,
        width,
        height,
      };
    } else {
      const centerX = startX + width / 2;
      const centerY = startY + height / 2;
      const radius = Math.max(Math.abs(width), Math.abs(height)) / 2;
      shape = {
        type: "circle",
        centerX,
        centerY,
        radius,
      };
    }
    existingShapes.push(shape);
    socket.send(
      JSON.stringify({
        type: "chat",
        message: JSON.stringify({
          shape,
        }),
        roomId,
      }),
    );
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!drawing) return;

    const rect = canvas.getBoundingClientRect();
    const width = e.clientX - rect.left - startX;
    const height = e.clientY - rect.top - startY;

    clearCanvas(existingShapes, canvas, ctx);

    ctx.strokeStyle = "rgb(255, 255, 255)";
    const tool = selectedToolRef.current;

    if (tool === "rect") {
      ctx.strokeRect(startX, startY, width, height);
    } else if (tool === "circle") {
      const centerX = startX + width / 2;
      const centerY = startY + height / 2;
      const radius = Math.max(Math.abs(width), Math.abs(height)) / 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.closePath();
    }
  };

  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("mouseup", handleMouseUp);
  canvas.addEventListener("mousemove", handleMouseMove);

  // Cleanup: detach every listener so remounts don't stack duplicates.
  return () => {
    socket.removeEventListener("message", handleSocketMessage);
    canvas.removeEventListener("mousedown", handleMouseDown);
    canvas.removeEventListener("mouseup", handleMouseUp);
    canvas.removeEventListener("mousemove", handleMouseMove);
  };
}

function clearCanvas(
  existingShapes: Shape[],
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgb(0, 0, 0)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  existingShapes.map((shape) => {
    if (!shape) return;
    if (shape.type === "rect") {
      ctx.strokeStyle = "rgb(255, 255, 255)";
      ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
    } else if (shape.type === "circle") {
      ctx.strokeStyle = "rgb(255, 255, 255)";
      ctx.beginPath();
      ctx.arc(shape.centerX, shape.centerY, shape.radius, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.closePath();
    }
  });
}

async function getExistingShapes(roomId: string): Promise<Shape[]> {
  const token = getToken();
  const res = await axios.get(`${BACKEND_URL}/chat/${roomId}`, {
    headers: token ? { Authorization: token } : undefined,
  });
  const messages = res.data.messages;

  const shapes = messages
    .map((x: { message: string }) => {
      try {
        const parsed = JSON.parse(x.message);
        return parsed.shape;
      } catch {
        // Skip non-shape chat messages.
        return null;
      }
    })
    .filter(Boolean);

  return shapes;
}
