import { WebSocket, WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "@repo/backend-common/config";
import { prisma } from "@repo/db";

const wss = new WebSocketServer({ port: 8081 });

interface User {
  ws: WebSocket;
  rooms: string[];
  userId: string;
}

const users: User[] = [];

function checkUser(token: string): string | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded === "string") {
      return null;
    }
    if (!decoded || !decoded.userId) {
      return null;
    }
    return decoded.userId;
  } catch (error) {
    return null;
  }
}

wss.on("connection", function connection(ws, request) {
  const fullUrl = new URL(request.url!, "http://localhost:8081"); // base required

  const token = fullUrl.searchParams.get("token");

  if (!token || token.length > 500) {
    ws.close(1008, "Invalid token");
    return;
  }

  const userId = checkUser(token);
  if (userId == null) {
    ws.close();
    return;
  }

  users.push({
    userId,
    rooms: [],
    ws,
  });

  ws.on("message", async function message(data) {
    let parseData: { type?: string; roomId?: unknown; message?: string };
    try {
      parseData = JSON.parse(data.toString());
    } catch {
      ws.send(
        JSON.stringify({ type: "error", message: "Invalid message format" })
      );
      return;
    }

    // Normalize roomId to a string for all in-memory bookkeeping.
    const roomId =
      parseData.roomId != null ? String(parseData.roomId) : undefined;

    if (parseData.type === "join_room") {
      if (!roomId) return;
      const user = users.find((x) => x.ws === ws);
      if (user && !user.rooms.includes(roomId)) {
        user.rooms.push(roomId);
      }
      return;
    }

    if (parseData.type === "leave_room") {
      if (!roomId) return;
      const user = users.find((x) => x.ws === ws);
      if (!user) return;
      user.rooms = user.rooms.filter((r) => r !== roomId);
      return;
    }

    // Ephemeral live-cursor presence: broadcast to the room, never persisted.
    if (parseData.type === "cursor") {
      if (!roomId) return;
      const sender = users.find((x) => x.ws === ws);
      if (!sender || !sender.rooms.includes(roomId)) return;

      users.forEach((u) => {
        if (u.ws !== ws && u.rooms.includes(roomId)) {
          u.ws.send(
            JSON.stringify({
              type: "cursor",
              roomId,
              from: userId,
              x: (parseData as { x?: number }).x,
              y: (parseData as { y?: number }).y,
              name: (parseData as { name?: string }).name,
              color: (parseData as { color?: string }).color,
            })
          );
        }
      });
      return;
    }

    if (parseData.type === "chat") {
      if (!roomId) return;
      const message = parseData.message;
      if (typeof message !== "string") return;

      const user = users.find((x) => x.ws === ws);
      if (!user) return;

      // Check if user is in that room
      if (!user.rooms.includes(roomId)) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "You are not in this room",
          })
        );
        return;
      }

      try {
        await prisma.chat.create({
          data: {
            roomId: Number(roomId),
            message,
            userId,
          },
        });
      } catch (err) {
        console.error("Failed to persist chat message", err);
        ws.send(
          JSON.stringify({ type: "error", message: "Failed to save message" })
        );
        return;
      }

      // Send message to everyone who is in that room
      users.forEach((u) => {
        if (u.rooms.includes(roomId)) {
          u.ws.send(
            JSON.stringify({
              type: "chat",
              roomId,
              from: userId,
              message,
            })
          );
        }
      });
    }
  });

  // Clean up on disconnect so we don't leak users or broadcast to dead sockets.
  ws.on("close", function close() {
    const index = users.findIndex((x) => x.ws === ws);
    if (index !== -1) {
      users.splice(index, 1);
    }
  });

  ws.on("error", function error(err) {
    console.error("WebSocket error", err);
  });
});
