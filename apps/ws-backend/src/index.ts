import { WebSocket, WebSocketServer } from "ws";
import jwt, { JwtPayload } from "jsonwebtoken";
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
  const url = request.url;

  if (!url) {
    return;
  }

  const queryParams = new URLSearchParams(url.split("?")[1]);
  const token = queryParams.get("token");
  if (!token) {
    ws.close(1008, "Authentication token missing");
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
    // if (typeof data !== String) {
    //   return null;
    // }

    const parseData = JSON.parse(data as unknown as string); //{type: "join-room", roomid: 1}

    if (parseData.type == "join_room") {
      const user = users.find((x) => x.ws === ws);

      user?.rooms.push(parseData.roomId);
    }

    if (parseData.type == "leave_room") {
      const user = users.find((x) => x.ws === ws);

      if (!user) return;

      user.rooms = user.rooms.filter((roomId) => roomId !== parseData.roomId);
    }

    if (parseData.type == "chat") {
      const roomId = parseData.roomId;
      const message = parseData.message;
      const user = users.find((x) => x.ws === ws);

      if (!user) return;

      // Check if user is in that room

      if (!user.rooms.includes(parseData.roomId)) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "You are not in this room",
          })
        );
        return;
      }

     
      await prisma.chat.create({
        data: {
          roomId,
          message,
          userId,
        },
      });

 //send message to everyone who are in that room
      users.forEach((u) => {
        if (u.rooms.includes(parseData.roomId)) {
          u.ws.send(
            JSON.stringify({
              type: "chat",
              roomId: roomId,
              from: userId,
              message: message,
            })
          );
        }
      });
    }
  });
});
