"use client";

import dynamic from "next/dynamic";

// DAW depends on Web Audio API and localStorage — disable SSR to avoid hydration mismatch
const DAW = dynamic(() => import("@/components/DAW"), { ssr: false });

export default function ClientPage() {
  return <DAW />;
}
