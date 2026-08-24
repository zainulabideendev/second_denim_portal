"use client";

import React from "react";
import { Sidebar } from "./sidebar";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { appUser } = useAuth();
  const isSalesman = appUser?.role === "salesman";

  return (
    <div
      className={cn(
        "flex h-screen overflow-hidden",
        isSalesman ? "bg-[#f4f6f9]" : "bg-background"
      )}
    >
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div
          className={cn(
            "min-h-full",
            isSalesman ? "px-4 py-6 sm:px-6 lg:px-8 lg:py-8" : "p-6"
          )}
        >
          <div className={cn(isSalesman && "mx-auto max-w-6xl")}>{children}</div>
        </div>
      </main>
    </div>
  );
}
