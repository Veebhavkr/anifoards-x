"use client";

import { useState } from "react";
import { mainNavigation } from "@/config/navigation/navigation";

export default function MobileSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 lg:hidden"
        aria-label="Open navigation"
        title="Open navigation"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden="true"
        >
          <line x1="4" x2="20" y1="6" y2="6" />
          <line x1="4" x2="20" y1="12" y2="12" />
          <line x1="4" x2="20" y1="18" y2="18" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
            aria-label="Close navigation"
          />

          {/* Sidebar */}
          <aside className="relative h-full w-[min(18rem,85vw)] overflow-y-auto bg-white shadow-xl">
            <div className="flex items-center justify-between border-b p-5 sm:p-6">
              <div className="min-w-0">
                <h1 className="text-xl font-bold">Anifoards</h1>
                <p className="mt-1 text-xs text-gray-500">
                  Business Operating System
                </p>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300"
                aria-label="Close navigation"
                title="Close navigation"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <line x1="18" x2="6" y1="6" y2="18" />
                  <line x1="6" x2="18" y1="6" y2="18" />
                </svg>
              </button>
            </div>

            <nav className="p-4">
              <p className="px-3 py-2 text-xs font-semibold uppercase text-gray-400">
                Main
              </p>

              <div className="space-y-1">
                {mainNavigation.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-3 py-3 text-sm text-gray-700 transition hover:bg-gray-100"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
