"use client";
import { WS_URL } from "@/config";

import { useEffect, useState } from "react";
import Canvas from "./Canvas";

export default function ROOMCanvas({ roomId }: { roomId: string }) {
  const [socket, setSocket] = useState<WebSocket>();

  useEffect(() => {
    const ws = new WebSocket(
      `${WS_URL}?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxZDFiNWNkZi0xZjQ2LTRlNGYtOTRjMS0xOGYwN2NiZTZlMjUiLCJpYXQiOjE3NjkwMjIxMDEsImV4cCI6MTc2OTEwODUwMX0.XwLE99mfjEnJV0w9gFtWGe_7dGrKwIKg4N4Ns23aetY`
    );

    ws.onopen = () => {
      setSocket(ws);
      // console.log(socket)
      const data = JSON.stringify({
        type: "join_room",
        roomId: roomId,
      });
      ws.send(data);
    };
  }, [  roomId]);

  if (!socket) {
    return <div>Server is connecting ...</div>;
  }
 

  return (
    <div>
      <Canvas roomId={roomId} socket={socket}></Canvas>
    </div>
  );
}
