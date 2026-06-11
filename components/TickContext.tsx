"use client";

import { createContext, useContext, useEffect, useState } from "react";

const TickContext = createContext(0);

/**
 * Broadcasts the current time (in ms) once per second to every live label
 * ("posted X ago", the refresh timer, the clock). Starts at 0 until mounted
 * so the server-rendered HTML and the first client render match exactly.
 */
export function TickProvider({ children }: { children: React.ReactNode }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <TickContext.Provider value={now}>{children}</TickContext.Provider>;
}

/** The shared ticking clock. 0 means "not mounted yet — render a placeholder". */
export function useNow(): number {
  return useContext(TickContext);
}
