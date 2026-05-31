"use client";
import { WS_URL } from "@/config";

import { useEffect, useState } from "react";
import Link from "next/link";
import Canvas from "./Canvas";
import { getToken } from "@/lib/auth";

export default function ROOMCanvas({ roomId }: { roomId: string }) {
  const [socket, setSocket] = useState<WebSocket>();
  const [authMissing, setAuthMissing] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setAuthMissing(true);
      return;
    }

    const ws = new WebSocket(`${WS_URL}?token=${token}`);

    ws.onopen = () => {
      setSocket(ws);
      ws.send(
        JSON.stringify({
          type: "join_room",
          roomId: roomId,
        })
      );
    };

    return () => {
      // Tear down the connection when the room unmounts or roomId changes.
      ws.close();
    };
  }, [roomId]);

  if (authMissing) {
    return (
      <div className="flex h-screen items-center justify-center text-center">
        <div>
          <p className="mb-4 text-lg">You need to sign in to join this room.</p>
          <Link
            href="/signin"
            className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (!socket) {
    return <div>Server is connecting ...</div>;
  }

  return (
    <div>
      <Canvas roomId={roomId} socket={socket}></Canvas>
    </div>
  );
}
