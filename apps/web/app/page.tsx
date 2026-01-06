"use client";

import { useState } from "react";
import styles from "./page.module.css";
import { useRouter } from "next/navigation";


export default function Home() {
  const [roomId, setRoomId] = useState("");
 const router =  useRouter();

  return (
    <div style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh",
      width: "100wh"

    }}>
      <input style={{padding: "12px",
        margin: "8px"
      }}
        value={roomId}
        onChange={(e) => {
          setRoomId(e.target.value);
        }}
        placeholder="Enter roomId"
      ></input>
      <button style={{ 
        padding:"12px",
        margin: "8px"
      }}
      onClick={() => {
        router.push(`/room/${roomId}`);
      }}> Join the room</button>
    </div>
  );
}
