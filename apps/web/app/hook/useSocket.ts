// import { WebSocket } from "ws";
import { useEffect, useState } from "react";
import { WS_URL } from "../config";

export function useSocket() {
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(
      `${WS_URL}?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIzN2FiNWQyNy00Y2MxLTRjZDUtOGJmZC1lODAzMmNjY2IxZjYiLCJpYXQiOjE3Njc3MjMwMjgsImV4cCI6MTc2NzgwOTQyOH0.IQVZ-i-EA75lFASUvtUPS0Zt-wguvbvv6_TPOqNCfAg`
    );

    ws.onopen = () => {
      setLoading(false);
      setSocket(ws);
    };

    // ws.onclose = () => {
    //     setLoading(false);
    //     setSocket(null);
    // }
  }, []);

  return { loading, socket };
}
