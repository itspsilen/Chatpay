/**
 * NotificationBell — in-app notification center.
 * Reads from localStorage. Pops a dropdown with unread notifications.
 */
import { useState, useEffect } from 'react'
import { Bell } from 'lucide-react'
import {
  loadNotifications,
  markNotificationRead,
  markAllRead,
  type StoredNotification,
} from '../lib/scheduleStorage'

const TYPE_COLOR: Record<StoredNotification['type']  , string> = {
  schedule_due: 'text-purple-400',
  schedule_skipped: 'text-yellow-400',
  batch_done: 'text-green-400',
  batch_partial: 'text-orange-400',
  info: 'text-accent',
  error: 'text-red-400',
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<StoredNotification[]>([])

  const refresh = () => setNotifications(loadNotifications())

  useEffect(() => {
    // Defer initial load off the synchronous effect call to satisfy lint
    const initial = setTimeout(refresh, 0)
    const interval = setInterval(refresh, 30_000)
    return () => { clearTimeout(initial); clearInterval(interval) }
  }, [])

  const unread = notifications.filter((n) => !n.read).length

  const handleMarkRead = (id: string) => {
    markNotificationRead(id)
    refresh()
  }

  const handleMarkAllRead = () => {
    markAllRead()
    refresh()
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-xl hover:bg-white/5 text-muted hover:text-white transition-colors"
        aria-label="Notifications"
      >
        <Bell size={17} />
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-accent text-white text-[9px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />

          {/* Dropdown */}
          <div className="absolute right-0 top-10 z-40 w-80 bg-surface border border-border rounded-2xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <p className="text-sm font-medium text-white">Notifications</p>
              {unread > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-muted hover:text-accent transition-colors"
                >
                  Mark all read
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-muted text-sm">No notifications yet</div>
            ) : (
              <div className="max-h-80 overflow-y-auto divide-y divide-border">
                {notifications.slice(0, 30).map((n) => (
                  <button
                    key={n.id}
                    onClick={() => handleMarkRead(n.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-white/4 transition-colors ${n.read ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 flex-shrink-0" />}
                      <div className={n.read ? 'ml-3.5' : ''}>
                        <p className={`text-xs font-medium ${TYPE_COLOR[n.type] ?? 'text-white'}`}>{n.title}</p>
                        <p className="text-xs text-muted mt-0.5 text-pretty">{n.body}</p>
                        <p className="text-[10px] text-muted/40 mt-1">
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
