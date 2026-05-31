"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  Plus,
  Search,
  Trash2,
  LayoutGrid,
  LogOut,
  Loader2,
  PencilRuler,
} from "lucide-react";
import { getToken, clearToken } from "@/lib/auth";
import { getMe, CurrentUser } from "@/lib/user";
import { Board, listRooms, createRoom, deleteRoom } from "@/lib/rooms";

export default function DashboardPage() {
  const router = useRouter();

  const [me, setMe] = useState<CurrentUser | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/signin");
      return;
    }
    let active = true;
    (async () => {
      try {
        const [user, rooms] = await Promise.all([getMe(), listRooms()]);
        if (!active) return;
        if (!user) {
          // Token invalid/expired.
          clearToken();
          router.replace("/signin");
          return;
        }
        setMe(user);
        setBoards(rooms);
      } catch {
        if (active) setError("Could not load your boards.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return boards;
    return boards.filter((b) =>
      (b.name || b.slug).toLowerCase().includes(q)
    );
  }, [boards, query]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (name.length < 2) {
      setError("Board name must be at least 2 characters.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const { roomId } = await createRoom(name);
      router.push(`/canvas/${roomId}`);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        clearToken();
        router.replace("/signin");
        return;
      }
      setError(
        axios.isAxiosError(err)
          ? err.response?.data?.message ?? "Could not create the board."
          : "Could not create the board."
      );
      setCreating(false);
    }
  }

  async function handleDelete(id: number) {
    const prev = boards;
    setBoards((b) => b.filter((x) => x.id !== id)); // optimistic
    try {
      await deleteRoom(id);
    } catch {
      setBoards(prev); // rollback
      setError("Could not delete the board.");
    }
  }

  function logout() {
    clearToken();
    router.replace("/signin");
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <PencilRuler className="h-6 w-6 text-blue-500" />
            <span className="text-xl font-bold">WhiteSpace</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {me && (
              <span className="text-zinc-400">
                {me.name || me.email}
              </span>
            )}
            <button
              onClick={logout}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-zinc-300 hover:bg-zinc-800"
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <LayoutGrid className="h-6 w-6 text-blue-400" /> Your boards
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Create a whiteboard and share its link to collaborate in real time.
            </p>
          </div>

          <form onSubmit={handleCreate} className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New board name"
              maxLength={20}
              className="w-56 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={creating}
              className="flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Plus size={16} />
              )}
              Create
            </button>
          </form>
        </div>

        <div className="mb-5 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
          <Search size={16} className="text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search boards"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading boards…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 py-20 text-center text-zinc-500">
            {boards.length === 0
              ? "No boards yet — create your first one above."
              : "No boards match your search."}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((board) => (
              <div
                key={board.id}
                className="group relative flex flex-col rounded-xl border border-zinc-800 bg-zinc-900 transition hover:border-zinc-600"
              >
                <button
                  onClick={() => router.push(`/canvas/${board.id}`)}
                  className="flex h-28 items-center justify-center rounded-t-xl bg-gradient-to-br from-zinc-800 to-zinc-900"
                >
                  <LayoutGrid className="h-8 w-8 text-zinc-600" />
                </button>
                <div className="flex items-center justify-between p-3">
                  <div className="min-w-0">
                    <button
                      onClick={() => router.push(`/canvas/${board.id}`)}
                      className="block max-w-[12rem] truncate text-left font-medium hover:text-blue-400"
                    >
                      {board.name || board.slug}
                    </button>
                    <span className="text-xs text-zinc-500">
                      {new Date(board.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(board.id)}
                    title="Delete board"
                    className="rounded-lg p-2 text-zinc-500 opacity-0 transition hover:bg-zinc-800 hover:text-red-400 group-hover:opacity-100"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
