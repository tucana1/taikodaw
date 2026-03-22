import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TaikoDaw — Taiko Beat Sequencer",
  description:
    "A lightweight DAW for composing taiko drum patterns. Layer multiple parts with Don (face) and Ka (edge) hits, control tempo and time signature, and adjust volumes per hit or per track.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
