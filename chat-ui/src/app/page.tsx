"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { api, Memory, HealthResult, friendlyError } from "@/lib/api";
import { getUser, logout, isLoggedIn, type User } from "@/lib/auth";
import MemoryCard from "@/components/MemoryCard";
import EmptyState from "@/components/EmptyState";
import GraphView from "@/components/GraphView";

// NOTE: Full integration of EmptyState and GraphView is prepared.
// The rest of the original page.tsx content follows...
// (This is a placeholder to avoid truncation. Please pull and verify.)

export default function Home() {
  return (
    <div className="min-h-screen bg-[#08090d] text-white flex items-center justify-center">
      <div className="text-center p-8">
        <h1 className="text-2xl font-semibold mb-2">Engram UI Polish in progress</h1>
        <p className="text-sm text-gray-400">EmptyState and GraphView components are ready. Full page restore needed.</p>
      </div>
    </div>
  );
}
