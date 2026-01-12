import { BACKEND_URL } from "@/config";
import axios from "axios";

import { parse } from "path";

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
  socket: WebSocket
) {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  const existingShapes: Shape[] = await getExistingShapes(roomId);

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.type == "chat") {
      const parsedData = JSON.parse(message.message);
      // console.log(parsedData.shape)
      const shape = parsedData.shape;
      existingShapes.push(shape);
      clearCanvas(existingShapes, canvas, ctx);
    }
  };

  clearCanvas(existingShapes, canvas, ctx);

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
    const width = e.clientX - startX;
    const height = e.clientY - startY;

    const shape: Shape = {
      type: "rect",
      x: startX,
      y: startY,
      width,
      height,
    };
    existingShapes.push({
      type: "rect",
      x: startX,
      y: startY,
      width,
      height,
    });
    socket.send(
      JSON.stringify({
        type: "chat",
        message: JSON.stringify({
          shape,
        }),
        roomId,
      })
    );
  });

  addEventListener("mousemove", (e) => {
    if (!drwaing) return;

    const width = e.clientX - startX;
    const height = e.clientY - startY;
    clearCanvas(existingShapes, canvas, ctx);

    ctx.strokeStyle = "rgb(255, 255, 255)";

    ctx?.strokeRect(startX, startY, width, height);
  });
}

function clearCanvas(
  existingShapes: Shape[],
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D
) {
  ctx?.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgb(0, 0, 0)";

  ctx.fillRect(0, 0, canvas.width, canvas.height);

  existingShapes.map((shape) => {
    if (shape.type === "rect") {
      ctx.strokeStyle = "rgb(255, 255, 255)";

      ctx?.strokeRect(shape.x, shape.y, shape.width, shape.height);
    }
  });
}

async function getExistingShapes(roomId: string) {
  const res = await axios.get(`${BACKEND_URL}/chat/${roomId}`);
  const messages = await res.data.messages;

  const shape = messages.map((x: { message: string }) => {
    const shapes = JSON.parse(x.message);

    // console.log(shapes.shape)
    return shapes.shape;
  });
  // console.log(shape.shapes)
  return shape;
}
