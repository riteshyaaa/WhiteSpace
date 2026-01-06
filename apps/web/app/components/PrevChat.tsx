import axios from "axios";
import { BACKEND_URL } from "../config";
import ChatRoomClient from "./ChatRoomClient";

async function getChatHistory(roomId: number) {
  const response = await axios.get(`${BACKEND_URL}/chat/${roomId}`);
  //   console.log("Chat history response:", response.data);
  return response.data.messages;
}

export default async function PrevChat({ roomId }: { roomId: number }) {
  const messages = await getChatHistory(roomId); // example roomId

//   console.log("Messages fetched in PrevChat:", messages);


  return ( 
    <div>
      <ChatRoomClient roomId={roomId} messages={messages}></ChatRoomClient>
    </div>
  );
}
