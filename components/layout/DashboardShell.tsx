
"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { mainNavigation } from "@/config/navigation/navigation";
import MobileSidebar from "@/components/navigation/MobileSidebar";
import NotificationBell from "@/components/notifications/NotificationBell";

type DashboardShellProps = {
  children: ReactNode;
};

export default function DashboardShell({
  children,
}: DashboardShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen min-w-0 overflow-x-hidden bg-gray-50">
      <div className="flex min-h-screen min-w-0">
        <aside className="hidden w-64 shrink-0 border-r bg-white lg:block">
          <div className="p-6">
            <h1 className="text-xl font-bold">Anifoards</h1>

            <p className="mt-1 text-xs text-gray-500">
              Business Operating System
            </p>
          </div>

          <nav className="px-4">
            <p className="px-3 py-2 text-xs font-semibold uppercase text-gray-400">
              Main
            </p>

            <div className="space-y-1">
              {mainNavigation.map((item) => {
                const isActive = pathname === item.href;

                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`block rounded-lg px-3 py-2 text-sm transition ${
                      isActive
                        ? "bg-black font-medium text-white"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {item.label}
                  </a>
                );
              })}
            </div>
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="relative z-40 flex min-h-16 min-w-0 items-center justify-between gap-2 border-b bg-white px-3 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <MobileSidebar />

              <h2 className="truncate text-base font-semibold sm:text-lg">
                Anifoards
              </h2>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
              {/* NotificationBell already contains its own button */}
              <NotificationBell />

              <button
                type="button"
                aria-label="Profile"
                className="rounded-lg border px-2.5 py-2 text-sm hover:bg-gray-50 sm:px-3"
              >
                <span className="sm:hidden" aria-hidden="true">
                  👤
                </span>

                <span className="hidden sm:inline">
                  Profile
                </span>
              </button>
            </div>
          </header>

          <main className="min-w-0 flex-1 overflow-x-hidden p-3 sm:p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}