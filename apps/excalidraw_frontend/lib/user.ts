import axios from "axios";
import { BACKEND_URL } from "@/config";
import { getToken } from "./auth";

export interface CurrentUser {
  id: string;
  name: string | null;
  email: string;
}

export async function getMe(): Promise<CurrentUser | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await axios.get(`${BACKEND_URL}/me`, {
      headers: { Authorization: token },
    });
    return res.data.user as CurrentUser;
  } catch {
    return null;
  }
}

const CURSOR_COLORS = [
  "#e03131",
  "#2f9e44",
  "#1971c2",
  "#f08c00",
  "#9c36b5",
  "#0c8599",
  "#e8590c",
  "#5f3dc4",
];

/** Deterministic color so a given user always gets the same cursor color. */
export function colorFromId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return CURSOR_COLORS[hash % CURSOR_COLORS.length]!;
}
