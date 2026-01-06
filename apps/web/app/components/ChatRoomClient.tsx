"use client";

import { useEffect, useState } from "react";
import { useSocket } from "../hook/useSocket";

export default function ChatRoomClient({
  messages,
  roomId,
}: {
  messages:{message: string}[];
  roomId: number;
}) {

    const {loading, socket} = useSocket();
    // const [chats, setChats] =  useState(messages);
    const [chats, setChats] = useState<{ id: string; message: string }[]>(messages.map(m => ({
  id: crypto.randomUUID(),
  message: m.message
})));

    const [currentMessage, setCurrentMessage] = useState("");
  

    useEffect(() => {
        if(socket && !loading){
            socket.send(JSON.stringify({
                type: "join_room",
                roomId: roomId,
            }))
            socket.onmessage = (event) => {
                const parsedData = JSON.parse(event.data);
                if(parsedData.type === "chat"){
                    // console.log("New message received:", parsedData.message);
                    setChats(prevChat => [...prevChat, { id: crypto.randomUUID(),message:parsedData.message}]);
                }
            }

            
        }
    }, [socket, loading, roomId]);


  return <div>
    {chats.map((chat) => (
        <div key={chat.id}>{chat.message}</div>
    ))}

    <input type="text" value={currentMessage} onChange={e => setCurrentMessage(e.target.value)}></input>
    <button onClick={() => {
        socket?.send(JSON.stringify({
            type: "chat",
            roomId,
            message: currentMessage,

        }))
        setCurrentMessage("");
    }}>send message</button>
  </div>;
}
