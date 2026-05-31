import axios from "axios";
import { BACKEND_URL } from "@/config";
import { getToken } from "./auth";

export interface Board {
  id: number;
  slug: string;
  name: string | null;
  createdAt: string;
}

function authHeader() {
  const token = getToken();
  return token ? { Authorization: token } : undefined;
}

export async function listRooms(): Promise<Board[]> {
  const res = await axios.get(`${BACKEND_URL}/rooms`, {
    headers: authHeader(),
  });
  return res.data.rooms as Board[];
}

export async function createRoom(name: string): Promise<{ roomId: number; slug: string }> {
  const res = await axios.post(
    `${BACKEND_URL}/room`,
    { name },
    { headers: authHeader() }
  );
  return res.data as { roomId: number; slug: string };
}

export async function deleteRoom(id: number): Promise<void> {
  await axios.delete(`${BACKEND_URL}/room/${id}`, {
    headers: authHeader(),
  });
}
