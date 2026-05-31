"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { BACKEND_URL } from "@/config";
import { setToken } from "@/lib/auth";

export function AuthPage({ isSignin }: { isSignin: boolean }) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignin) {
        const res = await axios.post(`${BACKEND_URL}/signin`, {
          email,
          password,
        });
        setToken(res.data.token);
        router.push("/dashboard");
      } else {
        await axios.post(`${BACKEND_URL}/signup`, {
          name,
          email,
          password,
        });
        // Account created — send the user to sign in.
        router.push("/signin");
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(
          err.response?.data?.message ??
            "Something went wrong. Please try again."
        );
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="items-center justify-center flex h-screen">
      <form
        onSubmit={handleSubmit}
        className="items-center justify-center flex flex-col gap-4 w-80 bg-white rounded-2xl text-black px-8 py-12 shadow-lg"
      >
        <h1 className="text-2xl font-bold text-gray-900">
          {isSignin ? "Sign In" : "Sign Up"}
        </h1>

        {!isSignin && (
          <input
            className="border border-gray-400 p-2 rounded-md w-full"
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={3}
            maxLength={50}
          />
        )}

        <input
          className="border border-gray-400 p-2 rounded-md w-full"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="border border-gray-400 p-2 rounded-md w-full"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={5}
          maxLength={50}
        />

        {error && (
          <p className="text-sm text-red-600 w-full text-center">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="bg-gray-600 cursor-pointer rounded-2xl w-40 mt-2 py-2 text-white hover:bg-gray-700 shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading
            ? "Please wait..."
            : isSignin
              ? "Sign In"
              : "Sign Up"}
        </button>

        <p className="text-sm text-gray-600">
          {isSignin ? (
            <>
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="text-blue-600 hover:underline">
                Sign up
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link href="/signin" className="text-blue-600 hover:underline">
                Sign in
              </Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
