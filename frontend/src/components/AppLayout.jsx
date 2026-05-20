import { useEffect, useRef, useState } from "react";
import { Bell, LayoutDashboard, LogOut, Shield, Sparkles, Users, Video } from "lucide-react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import api from "../api/api";
import { useAuth } from "../hooks/useAuth";

const roleBadgeClass = {
  admin: "bg-rose-100 text-rose-700",
  moderator: "bg-sky-100 text-sky-700",
  user: "bg-slate-100 text-slate-700",
};

const formatInvitationTime = (value) => {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const AppLayout = () => {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [invitations, setInvitations] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({ rooms: {}, meetings: {}, total: 0 });
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const notificationsRef = useRef(null);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  useEffect(() => {
    let isMounted = true;

    const fetchNotifications = async () => {
      try {
        const [{ data: invitationsData }, { data: unreadData }] = await Promise.all([
          api.get("/invitations/my"),
          api.get("/unread-counts"),
        ]);

        if (isMounted) {
          setInvitations(invitationsData);
          setUnreadCounts(unreadData);
        }
      } catch {
        if (isMounted) {
          setInvitations([]);
          setUnreadCounts({ rooms: {}, meetings: {}, total: 0 });
        }
      }
    };

    fetchNotifications();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    const socket = io("http://localhost:5000", {
      auth: { token },
    });

    socket.on("room-invitation", (invitation) => {
      setInvitations((currentInvitations) => {
        if (currentInvitations.some((currentInvitation) => currentInvitation.id === invitation.id)) {
          return currentInvitations;
        }

        return [invitation, ...currentInvitations];
      });
    });

    socket.on("room-invitation-updated", (invitation) => {
      setInvitations((currentInvitations) => {
        if (currentInvitations.some((currentInvitation) => currentInvitation.id === invitation.id)) {
          return currentInvitations.map((currentInvitation) =>
            currentInvitation.id === invitation.id ? invitation : currentInvitation
          );
        }

        return [invitation, ...currentInvitations];
      });
      window.dispatchEvent(
        new CustomEvent("room-invitation-status-updated", { detail: invitation })
      );
    });

    socket.on("unread-counts-updated", (counts) => {
      setUnreadCounts(counts);
      window.dispatchEvent(new CustomEvent("unread-counts-updated", { detail: counts }));
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);

  useEffect(() => {
    if (!isNotificationsOpen) {
      return undefined;
    }

    const handleOutsideClick = (event) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isNotificationsOpen]);

  useEffect(() => {
    const openNotifications = () => {
      setIsNotificationsOpen(true);
    };

    window.addEventListener("open-notifications", openNotifications);

    return () => {
      window.removeEventListener("open-notifications", openNotifications);
    };
  }, []);

  const updateInvitationStatus = async (invitationId, status) => {
    setNotificationError("");

    try {
      const { data } = await api.patch(`/invitations/${invitationId}`, { status });

      setInvitations((currentInvitations) =>
        currentInvitations.map((invitation) =>
          invitation.id === invitationId ? data : invitation
        )
      );

      if (status === "accepted") {
        window.dispatchEvent(new Event("room-invitation-accepted"));
      }

      window.dispatchEvent(
        new CustomEvent("room-invitation-status-updated", { detail: data })
      );
    } catch (err) {
      setNotificationError(err.response?.data?.message || "Could not update invitation.");
    }
  };

  const markInvitationRead = async (invitation) => {
    const isIncoming = invitation.invitedUser?.id === user?.id;
    const isOutgoing = invitation.invitedBy?.id === user?.id;
    const isUnread =
      (isIncoming && !invitation.invitedUserRead) || (isOutgoing && !invitation.inviterRead);

    if (!isUnread) {
      return invitation;
    }

    try {
      const { data } = await api.patch(`/invitations/${invitation.id}/read`);

      setInvitations((currentInvitations) =>
        currentInvitations.map((currentInvitation) =>
          currentInvitation.id === invitation.id ? data : currentInvitation
        )
      );

      return data;
    } catch {
      return invitation;
    }
  };

  const openInvitationRoom = (invitation) => {
    const isIncomingPending =
      invitation.invitedUser?.id === user?.id && invitation.status === "pending";

    if (!isIncomingPending) {
      markInvitationRead(invitation);
    }

    if (!invitation.room?.id || invitation.status !== "accepted") {
      return;
    }

    setIsNotificationsOpen(false);
    navigate(`/rooms/${invitation.room.id}`);
  };

  const unreadInvitations = invitations.filter(
    (invitation) =>
      (invitation.invitedUser?.id === user?.id &&
        invitation.status === "pending" &&
        !invitation.invitedUserRead) ||
      (invitation.invitedBy?.id === user?.id &&
        invitation.status !== "pending" &&
        !invitation.inviterRead)
  );
  const totalUnread = unreadCounts.total || 0;

  const linkClass = ({ isActive }) =>
    `inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
      isActive
        ? "bg-navy-900 text-white shadow-soft"
        : "text-slate-600 hover:bg-white/75 hover:text-navy-900"
    }`;

  return (
    <div className="app-surface min-h-screen">
      <div className="floating-shape left-6 top-24 h-24 w-40 rotate-6 animate-float" />
      <div className="floating-shape right-10 top-40 hidden h-28 w-28 -rotate-12 md:block" />
      <header className="app-content sticky top-0 z-40 border-b border-white/60 bg-white/55 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/dashboard" className="inline-flex items-center gap-2 text-xl font-black text-navy-900">
            <span className="icon-chip h-9 w-9 rounded-xl">
              <Sparkles className="h-5 w-5" />
            </span>
            CollabSpace
          </Link>

          <nav className="flex flex-wrap items-center gap-2">
            <NavLink to="/dashboard" className={linkClass}>
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </NavLink>
            <NavLink to="/rooms" className={linkClass}>
              <span className="inline-flex items-center gap-2">
                <Video className="h-4 w-4" />
                Rooms
                {totalUnread > 0 && (
                  <span className="animate-pulseSoft rounded-full bg-mint-500 px-1.5 py-0.5 text-[10px] font-black text-navy-950">
                    {totalUnread}
                  </span>
                )}
              </span>
            </NavLink>
            {user?.role === "admin" && (
              <>
                <NavLink to="/admin/dashboard" className={linkClass}>
                  <Shield className="h-4 w-4" />
                  Admin
                </NavLink>
                <NavLink to="/admin/users" className={linkClass}>
                  <Users className="h-4 w-4" />
                  Users
                </NavLink>
              </>
            )}
          </nav>

          <div className="flex items-center gap-3">
            <div className="relative" ref={notificationsRef}>
              <button
                type="button"
                onClick={() => setIsNotificationsOpen((isOpen) => !isOpen)}
                className="relative rounded-xl border border-white/70 bg-white/70 p-2 text-navy-900 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                {unreadInvitations.length > 0 && (
                  <span className="absolute -right-1 -top-1 animate-pulseSoft rounded-full bg-mint-500 px-1.5 py-0.5 text-[10px] font-black text-navy-950">
                    {unreadInvitations.length}
                  </span>
                )}
              </button>

              {isNotificationsOpen && (
                <div className="absolute right-0 z-50 mt-3 w-80 rounded-2xl border border-white/70 bg-white/90 p-4 shadow-lift backdrop-blur-2xl">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-bold text-navy-900">Invitations</h2>
                    <span className="status-pill">
                      {unreadInvitations.length} unread
                    </span>
                  </div>

                  {notificationError && (
                    <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {notificationError}
                    </div>
                  )}

                  <div className="mt-3 max-h-96 space-y-3 overflow-y-auto">
                    {invitations.length ? (
                      invitations.map((invitation) => {
                        const isIncoming = invitation.invitedUser?.id === user?.id;
                        const canOpenRoom = invitation.status === "accepted";
                        const isUnread =
                          (isIncoming && !invitation.invitedUserRead) ||
                          (!isIncoming && !invitation.inviterRead);

                        return (
                          <div
                            key={invitation.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => openInvitationRoom(invitation)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                openInvitationRoom(invitation);
                              }
                            }}
                            className={`rounded-2xl border p-3 text-left transition ${
                              isUnread ? "border-lavender-500 bg-lavender-200/25 shadow-soft" : "border-violet-100 bg-white/70"
                            } ${
                              canOpenRoom
                                ? "cursor-pointer hover:-translate-y-0.5 hover:border-lavender-500 hover:shadow-soft"
                                : "cursor-default"
                            }`}
                          >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {invitation.room?.name || "Room"}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {isIncoming
                                  ? `From ${invitation.invitedBy?.name || "Unknown"}`
                                  : `${invitation.invitedUser?.name || "User"} ${invitation.status} your invitation`}
                              </p>
                              <p
                                className="mt-2 truncate text-sm text-slate-700"
                                title={invitation.description || "No description provided."}
                              >
                                {invitation.description || "No description provided."}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                                roleBadgeClass[invitation.invitedBy?.role] || roleBadgeClass.user
                              }`}
                            >
                              {invitation.invitedBy?.role || "user"}
                            </span>
                          </div>
                          <time className="mt-2 block text-xs text-slate-500" dateTime={invitation.createdAt}>
                            {formatInvitationTime(invitation.createdAt)}
                          </time>

                          {invitation.status === "pending" && isIncoming ? (
                            <div className="mt-3 flex gap-2">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  updateInvitationStatus(invitation.id, "accepted");
                                }}
                              className="btn-primary px-3 py-1.5 text-xs"
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  updateInvitationStatus(invitation.id, "rejected");
                                }}
                                className="btn-secondary px-3 py-1.5 text-xs"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <div className="mt-3 flex items-center justify-between gap-2">
                              <p
                                className={`w-fit rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                                  invitation.status === "accepted"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : invitation.status === "pending"
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {invitation.status}
                              </p>
                              {invitation.status === "pending" && (
                                <span className="text-xs text-slate-500">Accept to open room</span>
                              )}
                            </div>
                          )}
                        </div>
                        );
                      })
                    ) : (
                      <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        No invitations yet.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="text-right text-sm">
              <p className="font-medium text-slate-900">{user?.name}</p>
              <p className="capitalize text-slate-500">{user?.role}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="btn-secondary px-3"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="app-content mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
