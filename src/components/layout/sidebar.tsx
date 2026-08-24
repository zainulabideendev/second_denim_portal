"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Shield,
  Phone,
  ClipboardList,
  Users,
  FileText,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Bell,
  Mail,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api-client";
import { getClientAuth } from "@/lib/firebase-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import type { Notification } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles: Array<"admin" | "manager" | "salesman">;
  badge?: number;
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { appUser } = useAuth();
  const role = appUser?.role ?? "salesman";

  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<Notification[]>("/api/notifications"),
    refetchInterval: 30_000,
  });

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0;

  const navItems: NavItem[] = [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      roles: ["admin", "manager", "salesman"],
    },
    {
      href: "/proxies/my",
      label: "My Proxies",
      icon: Shield,
      roles: ["salesman"],
    },
    {
      href: "/phone-numbers/my",
      label: "My Numbers",
      icon: Phone,
      roles: ["salesman"],
    },
    {
      href: "/requests/my",
      label: "My Requests",
      icon: ClipboardList,
      roles: ["salesman"],
    },
    {
      href: "/proxies",
      label: "Proxies",
      icon: Shield,
      roles: ["admin", "manager"],
    },
    {
      href: "/phone-numbers",
      label: "Phone Numbers",
      icon: Phone,
      roles: ["admin", "manager"],
    },
    {
      href: "/emails",
      label: "Emails",
      icon: Mail,
      roles: ["admin", "manager"],
    },
    {
      href: "/requests",
      label: "Requests",
      icon: ClipboardList,
      roles: ["admin", "manager"],
    },
    {
      href: "/pools",
      label: "Pools",
      icon: Layers,
      roles: ["admin"],
    },
    {
      href: "/users",
      label: "Users",
      icon: Users,
      roles: ["admin"],
    },
    {
      href: "/audit-log",
      label: "Audit Log",
      icon: FileText,
      roles: ["admin"],
    },
  ];

  const visibleItems = navItems.filter((item) =>
    item.roles.includes(role as "admin" | "manager" | "salesman")
  );

  const isSalesman = role === "salesman";

  async function handleLogout() {
    try {
      await getClientAuth().signOut();
      await api.post("/api/auth/logout", {});
      router.push("/login");
    } catch {
      toast.error("Failed to sign out");
    }
  }

  return (
    <aside
      className={cn(
        "relative flex flex-col border-r transition-all duration-200",
        isSalesman
          ? "border-slate-200/80 bg-white shadow-[1px_0_0_rgba(0,0,0,0.03)]"
          : "border-border bg-card",
        collapsed ? "w-[60px]" : "w-[220px]"
      )}
    >
      {/* Logo */}
      <div className={cn(
        "flex h-14 items-center border-b px-4",
        isSalesman ? "border-slate-200/80" : "border-border"
      )}>
        {!collapsed && (
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Second<span className="text-primary">Chance</span>
          </span>
        )}
        {collapsed && <Shield className="h-5 w-5 text-primary" />}
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-0.5 p-2 flex-1">
        {!collapsed && isSalesman && (
          <p className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Workspace
          </p>
        )}
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                isActive
                  ? isSalesman
                    ? "bg-primary text-primary-foreground font-medium shadow-sm"
                    : "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-border p-2 space-y-1">
        {/* Notifications link */}
        <Link
          href="/notifications"
          className={cn(
            "flex items-center gap-3 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
            pathname === "/notifications" && "bg-primary/10 text-primary font-medium"
          )}
        >
          <div className="relative">
            <Bell className="h-4 w-4 shrink-0" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[9px] text-white font-bold">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </div>
          {!collapsed && (
            <span className="flex-1 truncate">
              Notifications
              {unreadCount > 0 && (
                <Badge variant="destructive" className="ml-auto text-[10px] h-4 px-1">
                  {unreadCount}
                </Badge>
              )}
            </span>
          )}
        </Link>

        {/* User info */}
        {!collapsed && appUser && (
          <div className="px-2.5 py-1.5">
            <p className="text-xs font-medium text-foreground truncate">{appUser.name}</p>
            <p className="text-[11px] text-muted-foreground capitalize">{appUser.role}</p>
          </div>
        )}

        {/* Logout */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className={cn(
            "w-full justify-start gap-3 text-muted-foreground hover:text-foreground px-2.5",
            collapsed && "justify-center px-0"
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && "Sign out"}
        </Button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="absolute -right-3 top-16 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-foreground transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5" />
        )}
      </button>
    </aside>
  );
}
