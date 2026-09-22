
"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import NotificationPanel, {
  type NotificationItem,
} from "./NotificationPanel";

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  async function loadNotifications(currentUserId?: string) {
    setLoading(true);

    const activeUserId = currentUserId ?? userId;

    if (!activeUserId) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("notifications")
      .select(
        "id, type, title, message, related_task_id, related_activity_id, is_read, created_at",
      )
      .eq("user_id", activeUserId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!error && data) {
      setNotifications(data as NotificationItem[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (user) {
        setUserId(user.id);
        await loadNotifications(user.id);
      } else {
        setLoading(false);
      }
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleOutsideClick);
    }

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [open]);

  async function handleMarkAsRead(notificationId: string) {
    if (!userId) return;

    const { error } = await supabase
      .from("notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq("id", notificationId)
      .eq("user_id", userId);

    if (error) return;

    setNotifications((currentNotifications) =>
      currentNotifications.map((notification) =>
        notification.id === notificationId
          ? {
              ...notification,
              is_read: true,
            }
          : notification,
      ),
    );
  }

  async function handleMarkAllAsRead() {
    if (!userId) return;

    const { error } = await supabase
      .from("notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) return;

    setNotifications((currentNotifications) =>
      currentNotifications.map((notification) => ({
        ...notification,
        is_read: true,
      })),
    );
  }

  const unreadCount = notifications.filter(
    (notification) => !notification.is_read,
  ).length;

  function toggleNotifications() {
    const nextOpen = !open;

    setOpen(nextOpen);

    if (nextOpen) {
      loadNotifications();
    }
  }

  return (
    <div ref={containerRef} className="relative z-50">
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={toggleNotifications}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-lg transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300"
      >
        <span aria-hidden="true">🔔</span>

        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-20 z-[100] sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-[380px]">
          <NotificationPanel
            notifications={notifications}
            loading={loading}
            compact
            onMarkAsRead={handleMarkAsRead}
            onMarkAllAsRead={handleMarkAllAsRead}
          />
        </div>
      )}
    </div>
  );
}