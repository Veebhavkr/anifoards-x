
"use client";

import { useEffect, useState } from "react";
import DashboardShell from "@/components/layout/DashboardShell";
import NotificationPanel, {
  type NotificationItem,
} from "@/components/notifications/NotificationPanel";
import { createClient } from "@/lib/supabase/client";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

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
      .order("created_at", { ascending: false });

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

  return (
    <DashboardShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Notifications
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            View and manage your CRM notifications.
          </p>
        </div>

        <NotificationPanel
          notifications={notifications}
          loading={loading}
          onMarkAsRead={handleMarkAsRead}
          onMarkAllAsRead={handleMarkAllAsRead}
        />
      </div>
    </DashboardShell>
  );
}