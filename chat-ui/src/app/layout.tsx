import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Engram — Persistent AI Memory",
  description: "Private, self-hosted personal AI memory and knowledge graph",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
