
"use client";

import Link from "next/link";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  related_task_id: string | null;
  related_activity_id: string | null;
  is_read: boolean;
  created_at: string;
};

type NotificationPanelProps = {
  notifications: NotificationItem[];
  loading?: boolean;
  compact?: boolean;
  onMarkAsRead: (notificationId: string) => void;
  onMarkAllAsRead: () => void;
};

function formatNotificationDate(date: string) {
  return new Date(date).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function NotificationPanel({
  notifications,
  loading = false,
  compact = false,
  onMarkAsRead,
  onMarkAllAsRead,
}: NotificationPanelProps) {
  const unreadCount = notifications.filter(
    (notification) => !notification.is_read,
  ).length;

  return (
    <div
      className={
        compact
          ? "w-full overflow-hidden rounded-xl border bg-white shadow-xl"
          : "overflow-hidden rounded-2xl border bg-white"
      }
    >
      <div className="flex items-center justify-between gap-3 border-b px-4 py-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Notifications
          </h2>

          <p className="mt-1 text-xs text-gray-500">
            {unreadCount > 0
              ? `${unreadCount} unread notification${
                  unreadCount > 1 ? "s" : ""
                }`
              : "You are all caught up"}
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={onMarkAllAsRead}
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            Mark all as read
          </button>
        )}
      </div>

      {loading ? (
        <div className="px-4 py-8 text-center text-sm text-gray-500">
          Loading notifications...
        </div>
      ) : notifications.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <div className="text-3xl">🔔</div>
          <p className="mt-3 text-sm font-medium text-gray-700">
            No notifications yet
          </p>
          <p className="mt-1 text-xs text-gray-500">
            New task assignments will appear here.
          </p>
        </div>
      ) : (
        <div className={compact ? "max-h-96 overflow-y-auto" : ""}>
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`border-b px-4 py-4 last:border-b-0 ${
                notification.is_read ? "bg-white" : "bg-blue-50/60"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                    notification.is_read ? "bg-gray-300" : "bg-blue-600"
                  }`}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-gray-900">
                      {notification.title}
                    </h3>

                    {!notification.is_read && (
                      <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-medium text-blue-700">
                        New
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-sm leading-5 text-gray-600">
                    {notification.message}
                  </p>

                  <p className="mt-2 text-xs text-gray-400">
                    {formatNotificationDate(notification.created_at)}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {notification.related_task_id && (
                      <Link
                        href={`/tasks?taskId=${notification.related_task_id}`}
                        onClick={() => {
                          if (!notification.is_read) {
                            onMarkAsRead(notification.id);
                          }
                        }}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                      >
                        View Task
                      </Link>
                    )}

                    {!notification.is_read && (
                      <button
                        type="button"
                        onClick={() => onMarkAsRead(notification.id)}
                        className="text-xs font-medium text-gray-600 hover:text-gray-900"
                      >
                        Mark as read
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {compact && (
        <div className="border-t px-4 py-3 text-center">
          <Link
            href="/notifications"
            className="text-sm font-semibold text-blue-600 hover:text-blue-800"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}