import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Users,
  UsersRound,
  Bell,
  PenTool,
  Menu,
  LogOut,
  X,
} from "lucide-react";
import { auth, notifications } from "../../api/resources.api";
import { setAccessToken } from "../../api/client";
import { clear, toggle } from "../../app/store";
import { connectRealtime } from "../../api/socket";
import ErrorBoundary from "../ErrorBoundary";
import InvitationActions from "../notifications/InvitationActions";
import useInvitationResponse from "../notifications/useInvitationResponse";
import { playNotificationSound } from "../../utils/notificationSound";
const links = [
  ["/overview", "Overview", LayoutDashboard],
  ["/projects", "Projects", FolderKanban],
  ["/tasks", "My tasks", CheckSquare],
  ["/members", "Members", Users],
  ["/teams", "Teams", UsersRound],
  ["/notifications", "Notifications", Bell],
  ["/collaboration", "Collaboration", PenTool],
];
const list = (value) =>
  Array.isArray(value) ? value : value?.items || value?.data || [];

const getChatRoute = (notification) => {
  const metadata = notification?.metadata || {};
  const projectId = metadata.projectId || notification?.entityId;
  if (!projectId) return "/notifications";
  return `/tasks/${projectId}`;
};

export default function AppShell() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((s) => s.auth.user);
  const open = useSelector((s) => s.ui.sidebar);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationCenterRef = useRef(null);
  const queryClient = useQueryClient();
  const notificationQuery = useQuery({
    queryKey: ["notifications", "topbar"],
    queryFn: () => notifications.list({ limit: 8 }),
  });
  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (!notificationCenterRef.current?.contains(event.target)) {
        setNotificationsOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setNotificationsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);
  useEffect(() => {
    const token = localStorage.getItem("projecthub_access_token");
    if (!token) return undefined;
    const socket = connectRealtime(token);
    const refreshNotifications = (notification) => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["invitations", "pending"] });
      if (notification?.entityType === "CollaborationProject") {
        queryClient.invalidateQueries({
          queryKey: ["collaboration-project", notification.entityId],
        });
      }
      if (
        notification?.title === "New chat message" ||
        notification?.title === "You were mentioned in chat"
      ) {
        playNotificationSound();
        toast.info(notification.message, {
          icon: false,
          autoClose: 6000,
          onClick: () => navigate(getChatRoute(notification)),
        });
      }
    };
    socket.on("notification:created", refreshNotifications);
    socket.on("invitation:updated", refreshNotifications);
    const joinRequestUpdated = (event) => {
      if (event?.status === "approved") {
        toast.success("Your request was approved. Joining the meeting now.");
        navigate(`/collaboration/${event.projectId}/${event.boardId}`);
      } else if (event?.status === "rejected") {
        toast.info("Your request to join the meeting was declined.");
      } else if (event?.status === "expired") {
        toast.info("The meeting ended before your request was reviewed.");
      }
      queryClient.invalidateQueries({ queryKey: ["collaboration-boards"] });
      if (event?.boardId) {
        queryClient.invalidateQueries({
          queryKey: ["collaboration-board", event.boardId],
        });
        queryClient.invalidateQueries({
          queryKey: ["collaboration-sessions", event.boardId],
        });
        queryClient.invalidateQueries({
          queryKey: ["collaboration-join-requests", event.boardId],
        });
      }
    };
    socket.on("collaboration_join_request_updated", joinRequestUpdated);
    return () => {
      socket.off("notification:created", refreshNotifications);
      socket.off("invitation:updated", refreshNotifications);
      socket.off("collaboration_join_request_updated", joinRequestUpdated);
      socket.disconnect();
    };
  }, [navigate, queryClient]);
  const markRead = useMutation({
    mutationFn: (id) => notifications.read(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const respondToInvite = useInvitationResponse({
    onAccepted: () => setNotificationsOpen(false),
  });
  const notificationItems = list(notificationQuery.data);
  const unreadCount = notificationItems.filter((item) => !item.isRead).length;
  const openNotification = (item) => {
    const isOwnNotification =
      String(item.recipient?._id || item.recipient) ===
      String(user?._id || user?.id);
    if (!item.isRead && isOwnNotification) {
      markRead.mutate(item._id || item.id);
    }
    if (
      item.title === "New chat message" ||
      item.title === "You were mentioned in chat"
    ) {
      setNotificationsOpen(false);
      navigate(getChatRoute(item));
    }
  };
  const signOut = async () => {
    try {
      await auth.logout();
    } finally {
      setAccessToken(null);
      queryClient.clear();
      dispatch(clear());
      navigate("/login");
    }
  };
  return (
    <div className="app">
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand">
          <span>
            PROJECT<span className="coral">HUB</span>
          </span>
          <button className="icon mobile" onClick={() => dispatch(toggle())}>
            <X />
          </button>
        </div>
        <nav>
          {links.map(([to, label, Icon]) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => dispatch(toggle())}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="account">
          <div className="avatar">{user?.name?.[0]?.toUpperCase() || "P"}</div>
          <div>
            <strong>{user?.name}</strong>
            <small>{user?.email}</small>
          </div>
          <button className="icon" onClick={signOut} title="Sign out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <button className="icon mobile" onClick={() => dispatch(toggle())}>
            <Menu />
          </button>
          <div>
            <small>PROJECTHUB WORKSPACE</small>
            <p>Keep the work moving.</p>
          </div>
          <div className="topbar-actions">
            <div className="notification-center" ref={notificationCenterRef}>
              <button
                className="icon notification-trigger"
                type="button"
                aria-label="Open notifications"
                onClick={() => setNotificationsOpen((current) => !current)}
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="notification-count">{unreadCount}</span>
                )}
              </button>
              {notificationsOpen && (
                <div className="notification-panel">
                  <div className="notification-panel-head">
                    <strong>Notifications</strong>
                    <NavLink
                      to="/notifications"
                      onClick={() => setNotificationsOpen(false)}
                    >
                      View all
                    </NavLink>
                  </div>
                  {notificationItems.length ? (
                    <div className="notification-panel-list">
                      {notificationItems.map((item) => {
                        const invitationId = item.metadata?.invitationId;
                        const isPendingInvitation =
                          invitationId && item.metadata?.status === "pending";
                        return (
                          <div
                            className={`notification-item ${item.isRead ? "read" : "unread"}`}
                            key={item._id || item.id}
                          >
                            <button
                              className="notification-item-content"
                              type="button"
                              onClick={() => openNotification(item)}
                            >
                              <strong>{item.title}</strong>
                              <span>{item.message}</span>
                            </button>
                            {isPendingInvitation && (
                              <InvitationActions
                                invitationId={invitationId}
                                disabled={respondToInvite.isPending}
                                onRespond={(id, decision) =>
                                  respondToInvite.mutate({ id, decision })
                                }
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="notification-empty">
                      No notifications yet.
                    </span>
                  )}
                </div>
              )}
            </div>
            <span className="role">
              {user?.role === "admin" ? "ADMIN" : "USER"}
            </span>
          </div>
        </header>
        <div className="content">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
