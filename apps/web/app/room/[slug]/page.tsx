import axios from "axios";

import PrevChat from "../../components/PrevChat";
import { BACKEND_URL } from "../../config";

async function getRoomIdFromSlug(slug: string): Promise<number> {
  // In a real application, you would fetch the room ID from the backend using the slug.

  const response = await axios.get(`${BACKEND_URL}/room/${slug}`);
  // console.log("Room ID response:", response.data.roomId);
  return response.data.roomId;
}

export default async function ChatRoom({ 
  params,
}: {
  params: { slug: string };
}) {
  const { slug } = await params; 

  const roomId = await getRoomIdFromSlug(slug);
  // console.log("Params received:",  params);

  return (
    <div>
      <PrevChat roomId={roomId}></PrevChat>
    </div>
  );
}
