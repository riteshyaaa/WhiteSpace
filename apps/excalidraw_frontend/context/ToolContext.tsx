"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export type Tool = "rect" | "circle" ;

type ToolContextType = {
  selectedTool: Tool;                         // UI
  setSelectedTool: React.Dispatch<React.SetStateAction<Tool>>;
  selectedToolRef: React.MutableRefObject<Tool>; // Canvas logic
};

const ToolContext = createContext<ToolContextType | null>(null);

export function ToolProvider({ children }: { children: React.ReactNode }) {
  const [selectedTool, setSelectedTool] = useState<Tool>("rect");

  const selectedToolRef = useRef<Tool>(selectedTool);

  // keep ref in sync with state
  useEffect(() => {
    selectedToolRef.current = selectedTool;
  }, [selectedTool]);

  return (
    <ToolContext.Provider
      value={{ selectedTool, setSelectedTool, selectedToolRef }}
    >
      {children}
    </ToolContext.Provider>
  );
}

export function useTool() {
  const context = useContext(ToolContext);
  if (!context) {
    throw new Error("useTool must be used inside ToolProvider");
  }
  return context;
}
