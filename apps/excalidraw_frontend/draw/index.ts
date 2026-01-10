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

export default function InitializeCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  let existingShapes: Shape[] = [];

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

    existingShapes.push({
      type: "rect",
      x: startX,
      y: startY,
      width,
      height,
    });
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
