import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Save,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  UserCircle,
  Users,
  Video,
  X,
} from "lucide-react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import api from "../api/api";
import Loader from "./Loader";
import PasswordField from "./PasswordField";
import { useAuth } from "../hooks/useAuth";
import { isStrongPassword, passwordRequirementText } from "../utils/passwordValidation";

const formatInvitationTime = (value) => {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const roleBadgeClassName = {
  admin: "bg-rose-100 text-rose-700",
  moderator: "bg-sky-100 text-sky-700",
  user: "bg-slate-100 text-slate-700",
};

const invitationStatusClass = {
  accepted: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  rejected: "bg-slate-100 text-slate-600",
};

const getInitials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";

const emptyProfilePasswords = {
  newPassword: "",
  confirmPassword: "",
};

const AppLayout = () => {
  const { user, token, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const [invitations, setInvitations] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [unreadCounts, setUnreadCounts] = useState({ rooms: {}, meetings: {}, total: 0 });
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isInvitationsOpen, setIsInvitationsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState(false);
  const [invitationError, setInvitationError] = useState("");
  const [updatingInvitationId, setUpdatingInvitationId] = useState("");
  const [profileForm, setProfileForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
    avatarUrl: user?.avatarUrl || "",
    ...emptyProfilePasswords,
  });
  const [profileError, setProfileError] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const notificationsRef = useRef(null);
  const invitationsRef = useRef(null);
  const profileRef = useRef(null);
  const profileModalRef = useRef(null);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const openProfileSettings = () => {
    setProfileForm({
      name: user?.name || "",
      email: user?.email || "",
      avatarUrl: user?.avatarUrl || "",
      ...emptyProfilePasswords,
    });
    setProfileError("");
    setProfileMessage("");
    setIsProfileOpen(false);
    setIsProfileSettingsOpen(true);
  };

  useEffect(() => {
    let isMounted = true;

    const fetchNotifications = async () => {
      try {
        const [{ data: invitationsData }, { data: unreadData }, { data: notificationsData }] = await Promise.all([
          api.get("/invitations/my"),
          api.get("/unread-counts"),
          api.get("/notifications"),
        ]);

        if (isMounted) {
          setInvitations(invitationsData);
          setUnreadCounts(unreadData);
          setNotifications(notificationsData.notifications || []);
          setUnreadNotificationCount(notificationsData.unreadCount || 0);
        }
      } catch {
        if (isMounted) {
          setInvitations([]);
          setUnreadCounts({ rooms: {}, meetings: {}, total: 0 });
          setNotifications([]);
          setUnreadNotificationCount(0);
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

    let isMounted = true;

    const fetchProfile = async () => {
      try {
        const { data } = await api.get("/users/me");

        if (isMounted) {
          updateUser(data);
          setProfileForm((currentForm) => ({
            ...currentForm,
            name: data.name || "",
            email: data.email || "",
            avatarUrl: data.avatarUrl || "",
          }));
        }
      } catch {
        // Keep the locally saved session if profile refresh fails.
      }
    };

    fetchProfile();

    return () => {
      isMounted = false;
    };
  }, [token, updateUser]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    const socket = io(import.meta.env.VITE_SOCKET_URL, {
      auth: { token },
    });

    socket.on("room-invitation", (invitation) => {
      setInvitations((currentInvitations) => {
        if (currentInvitations.some((currentInvitation) => currentInvitation.id === invitation.id)) {
          return currentInvitations;
        }

        return [invitation, ...currentInvitations];
      });
      setIsInvitationsOpen(true);
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

    socket.on("room-meeting-scheduled", ({ roomId, meeting }) => {
      if (!roomId || !meeting) return;

      window.dispatchEvent(new CustomEvent("room-meeting-scheduled", { detail: { roomId, meeting } }));
    });

    socket.on("notification-created", (notification) => {
      setNotifications((currentNotifications) => [
        notification,
        ...currentNotifications.filter((item) => item.id !== notification.id),
      ].slice(0, 30));
      setUnreadNotificationCount((count) => count + 1);
    });

    socket.on("room-meeting-updated", ({ roomId, meeting }) => {
      window.dispatchEvent(new CustomEvent("room-meeting-updated", { detail: { roomId, meeting } }));
    });

    socket.on("room-meeting-deleted", ({ roomId, meetingId }) => {
      window.dispatchEvent(new CustomEvent("room-meeting-deleted", { detail: { roomId, meetingId } }));
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
    if (!isInvitationsOpen) {
      return undefined;
    }

    const handleOutsideClick = (event) => {
      if (invitationsRef.current && !invitationsRef.current.contains(event.target)) {
        setIsInvitationsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isInvitationsOpen]);

  useEffect(() => {
    if (!isProfileOpen) {
      return undefined;
    }

    const handleOutsideClick = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isProfileOpen]);

  useEffect(() => {
    if (!isProfileSettingsOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsProfileSettingsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isProfileSettingsOpen]);

  useEffect(() => {
    const openNotifications = () => {
      setIsNotificationsOpen(true);
    };

    window.addEventListener("open-notifications", openNotifications);

    return () => {
      window.removeEventListener("open-notifications", openNotifications);
    };
  }, []);

  const markNotificationRead = async (notification) => {
    if (notification.readAt) return;

    try {
      const { data } = await api.patch(`/notifications/${notification.id}/read`);
      setNotifications((currentNotifications) =>
        currentNotifications.map((item) => (item.id === notification.id ? data : item))
      );
      setUnreadNotificationCount((count) => Math.max(count - 1, 0));
    } catch {
      // Keep notification visible if read update fails.
    }
  };

  const updateInvitationStatus = async (invitationId, status) => {
    setInvitationError("");
    setUpdatingInvitationId(invitationId);

    try {
      const { data } = await api.patch(`/invitations/${invitationId}`, { status });
      setInvitations((currentInvitations) =>
        currentInvitations.map((invitation) => (invitation.id === invitationId ? data : invitation))
      );
      window.dispatchEvent(new CustomEvent("room-invitation-status-updated", { detail: data }));

      if (data.status === "accepted") {
        window.dispatchEvent(new Event("room-invitation-accepted"));
      }
    } catch (err) {
      const currentInvitation = invitations.find((invitation) => invitation.id === invitationId);

      if (currentInvitation && currentInvitation.status !== "pending") {
        setInvitationError("");
      } else {
        setInvitationError(err.response?.data?.message || "Could not update invitation.");
      }
    } finally {
      setUpdatingInvitationId("");
    }
  };

  const markInvitationRead = async (invitation) => {
    const isIncoming = invitation.invitedUser?.id === user?.id;
    const isOutgoing = invitation.invitedBy?.id === user?.id;
    const isUnread =
      (isIncoming && !invitation.invitedUserRead) || (isOutgoing && !invitation.inviterRead);

    if (!isUnread) return;

    try {
      const { data } = await api.patch(`/invitations/${invitation.id}/read`);
      setInvitations((currentInvitations) =>
        currentInvitations.map((item) => (item.id === invitation.id ? data : item))
      );
    } catch {
      // Non-blocking read state.
    }
  };

  const markAllNotificationsRead = async () => {
    try {
      await api.patch("/notifications/read-all");
      setNotifications((currentNotifications) =>
        currentNotifications.map((notification) => ({
          ...notification,
          readAt: notification.readAt || new Date().toISOString(),
        }))
      );
      setUnreadNotificationCount(0);
    } catch {
      // Non-blocking action.
    }
  };

  const clearNotifications = async () => {
    try {
      await api.delete("/notifications");
      setNotifications([]);
      setUnreadNotificationCount(0);
    } catch {
      // Non-blocking action.
    }
  };

  const handleProfileChange = (event) => {
    const { name, value } = event.target;
    setProfileForm((currentForm) => ({ ...currentForm, [name]: value }));
  };

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setProfileError("Profile photo must be PNG, JPG, or WebP.");
      return;
    }

    if (file.size > 500 * 1024) {
      setProfileError("Profile photo must be under 500 KB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setProfileForm((currentForm) => ({ ...currentForm, avatarUrl: reader.result || "" }));
      setProfileError("");
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarRemove = () => {
    setProfileForm((currentForm) => ({ ...currentForm, avatarUrl: "" }));
    setProfileError("");
    setProfileMessage("");
  };

  const handleProfileSave = async (event) => {
    event.preventDefault();
    setProfileError("");
    setProfileMessage("");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileForm.email)) {
      setProfileError("Enter a valid email address.");
      return;
    }

    if (profileForm.newPassword || profileForm.confirmPassword) {
      if (!isStrongPassword(profileForm.newPassword)) {
        setProfileError(passwordRequirementText);
        return;
      }

      if (profileForm.newPassword !== profileForm.confirmPassword) {
        setProfileError("Password confirmation does not match.");
        return;
      }
    }

    setIsProfileSaving(true);

    try {
      const { data } = await api.patch("/users/me", profileForm);
      updateUser(data);
      setProfileForm((currentForm) => ({
        ...currentForm,
        ...emptyProfilePasswords,
      }));
      setProfileMessage("Profile updated.");
    } catch (err) {
      setProfileError(err.response?.data?.message || "Could not update profile.");
    } finally {
      setIsProfileSaving(false);
    }
  };

  const totalUnread = unreadCounts.total || 0;
  const notificationCount = unreadNotificationCount;
  const pendingInvitationCount = invitations.filter(
    (invitation) => invitation.invitedUser?.id === user?.id && invitation.status === "pending"
  ).length;

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

          <div className="flex items-center gap-2">
            <div className="relative" ref={notificationsRef}>
              <button
                type="button"
                onClick={() => setIsNotificationsOpen((isOpen) => !isOpen)}
                className="relative grid h-11 w-11 place-items-center rounded-full border border-white/70 bg-white/75 text-navy-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:shadow-soft"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                {notificationCount > 0 && (
                  <span className="absolute -right-1 -top-1 animate-pulseSoft rounded-full bg-mint-500 px-1.5 py-0.5 text-[10px] font-black text-navy-950 ring-2 ring-white">
                    {notificationCount}
                  </span>
                )}
              </button>

              {isNotificationsOpen && (
                <div className="absolute right-0 z-50 mt-3 w-80 rounded-2xl border border-white/70 bg-white/90 p-4 shadow-lift backdrop-blur-2xl">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-bold text-navy-900">Notifications</h2>
                    <span className="status-pill">{notificationCount} new</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={markAllNotificationsRead} className="btn-secondary px-3 py-1.5 text-xs">
                      <CheckCheck className="h-3.5 w-3.5" />
                      Mark read
                    </button>
                    <button type="button" onClick={clearNotifications} className="btn-secondary px-3 py-1.5 text-xs">
                      <Trash2 className="h-3.5 w-3.5" />
                      Clear
                    </button>
                  </div>

                  <div className="scroll-panel mt-3 max-h-96 space-y-3">
                    {notifications.length ? notifications.map((notification) => (
                      <button
                        key={notification.id}
                        type="button"
                        onClick={() => {
                          markNotificationRead(notification);
                          if (notification.room?.id) {
                            setIsNotificationsOpen(false);
                            navigate(`/rooms/${notification.room.id}${notification.meeting ? "?tab=meetings" : ""}`);
                          }
                        }}
                        className={`w-full rounded-2xl border p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft ${
                          notification.readAt
                            ? "border-violet-100 bg-white/70"
                            : "border-mint-300/50 bg-mint-300/15"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{notification.title}</p>
                            <p className="mt-1 text-xs text-slate-500">{notification.message}</p>
                          </div>
                          {!notification.readAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-mint-500" />}
                        </div>
                        <time className="mt-2 block text-xs text-slate-500" dateTime={notification.createdAt}>
                          {formatInvitationTime(notification.createdAt)}
                        </time>
                      </button>
                    )) : (
                      <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        No notifications yet.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="relative" ref={invitationsRef}>
              <button
                type="button"
                onClick={() => {
                  setIsInvitationsOpen((isOpen) => !isOpen);
                  setIsNotificationsOpen(false);
                }}
                className="relative grid h-11 w-11 place-items-center rounded-full border border-white/70 bg-white/75 text-navy-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:shadow-soft"
                aria-label="Invitations"
              >
                <ClipboardList className="h-5 w-5" />
                {pendingInvitationCount > 0 && (
                  <span className="absolute -right-1 -top-1 animate-pulseSoft rounded-full bg-amber-300 px-1.5 py-0.5 text-[10px] font-black text-navy-950 ring-2 ring-white">
                    {pendingInvitationCount}
                  </span>
                )}
              </button>

              {isInvitationsOpen && (
                <div className="absolute right-0 z-50 mt-3 w-96 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/70 bg-white/90 p-4 shadow-lift backdrop-blur-2xl">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="font-bold text-navy-900">Invitations</h2>
                      <p className="mt-1 text-xs text-slate-500">Room requests and invite status</p>
                    </div>
                    <Link
                      to="/invitations"
                      onClick={() => setIsInvitationsOpen(false)}
                      className="btn-secondary px-3 py-1.5 text-xs"
                    >
                      View all
                    </Link>
                  </div>

                  {invitationError && (
                    <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {invitationError}
                    </div>
                  )}

                  <div className="scroll-panel mt-3 max-h-96 space-y-3">
                    {invitations.length ? (
                      invitations.map((invitation) => {
                        const isIncoming = invitation.invitedUser?.id === user?.id;
                        const canRespond = isIncoming && invitation.status === "pending";
                        const isUnread =
                          (isIncoming && !invitation.invitedUserRead) ||
                          (!isIncoming && !invitation.inviterRead);

                        return (
                          <div
                            key={invitation.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => markInvitationRead(invitation)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") markInvitationRead(invitation);
                            }}
                            className={`rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-soft ${
                              isUnread ? "border-amber-300 bg-amber-50/70 shadow-soft" : "border-violet-100 bg-white/70"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black text-slate-900">
                                  {invitation.room?.name || "Room invitation"}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {isIncoming
                                    ? `Invited by ${invitation.invitedBy?.name || "Unknown"}`
                                    : `${invitation.invitedUser?.name || "User"} is ${invitation.status}`}
                                </p>
                                <p className="mt-2 truncate text-sm text-slate-700">
                                  {invitation.description || "No description provided."}
                                </p>
                              </div>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-black capitalize ${invitationStatusClass[invitation.status] || invitationStatusClass.rejected}`}>
                                {invitation.status}
                              </span>
                            </div>
                            <time className="mt-2 block text-xs text-slate-500" dateTime={invitation.createdAt}>
                              {formatInvitationTime(invitation.createdAt)}
                            </time>

                            {canRespond && (
                              <div className="mt-3 flex gap-2">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    updateInvitationStatus(invitation.id, "accepted");
                                  }}
                                  disabled={updatingInvitationId === invitation.id}
                                  className="btn-primary px-3 py-1.5 text-xs"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    updateInvitationStatus(invitation.id, "rejected");
                                  }}
                                  disabled={updatingInvitationId === invitation.id}
                                  className="btn-secondary px-3 py-1.5 text-xs"
                                >
                                  <X className="h-3.5 w-3.5" />
                                  Reject
                                </button>
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

            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setIsProfileOpen((isOpen) => !isOpen)}
                onMouseEnter={() => setIsProfileOpen(true)}
                className="group inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/75 py-1 pl-1 pr-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:shadow-soft"
                aria-label="Profile menu"
              >
                <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-lavender-200 to-mint-300 text-sm font-black text-navy-900 ring-2 ring-white">
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    getInitials(user?.name)
                  )}
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block max-w-28 truncate text-sm font-black text-navy-900">{user?.name}</span>
                  <span className="block text-xs capitalize text-slate-500">{user?.role}</span>
                </span>
                <ChevronDown className="h-4 w-4 text-slate-500 transition group-hover:rotate-180" />
              </button>

              {isProfileOpen && (
                <div
                  onMouseLeave={() => setIsProfileOpen(false)}
                  className="absolute right-0 z-50 mt-3 w-72 origin-top-right animate-in rounded-2xl border border-white/70 bg-white/95 p-3 shadow-lift backdrop-blur-2xl"
                >
                  <div className="rounded-2xl bg-gradient-to-br from-lavender-200/40 via-white to-mint-300/25 p-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-white text-base font-black text-navy-900 shadow-sm ring-2 ring-white">
                        {user?.avatarUrl ? (
                          <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          getInitials(user?.name)
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-navy-900">{user?.name}</p>
                        <p className="truncate text-xs text-slate-500">{user?.email}</p>
                        <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-bold capitalize ${roleBadgeClassName[user?.role] || roleBadgeClassName.user}`}>
                          {user?.role}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1">
                    <button
                      type="button"
                      onClick={openProfileSettings}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-lavender-200/35 hover:text-navy-900"
                    >
                      <Settings className="h-4 w-4" />
                     Settings
                    </button>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4" />
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {isProfileSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/55 px-4 py-6 backdrop-blur-sm">
          <div
            ref={profileModalRef}
            className="scroll-panel max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/70 bg-white/95 p-5 shadow-lift backdrop-blur-2xl"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="section-kicker">Account</p>
                <h2 className="mt-1 text-2xl font-black text-navy-900">Profile Settings</h2>
                <p className="mt-1 text-sm text-slate-500">Update your identity, profile photo, and password.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsProfileSettingsOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-full border border-white/70 bg-white/80 text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:text-navy-900 hover:shadow-soft"
                aria-label="Close profile settings"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
              <aside className="rounded-3xl border border-white/70 bg-gradient-to-br from-lavender-200/35 via-white to-mint-300/20 p-5 shadow-sm">
                <div className="flex flex-col items-center text-center">
                  <div className="relative">
                    <span className="grid h-28 w-28 place-items-center overflow-hidden rounded-full bg-white text-3xl font-black text-navy-900 shadow-lift ring-4 ring-white">
                      {profileForm.avatarUrl ? (
                        <img src={profileForm.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        getInitials(profileForm.name)
                      )}
                    </span>
                    <label className="absolute -bottom-1 -right-1 grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-navy-900 text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-lavender-500">
                      <Camera className="h-4 w-4" />
                      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatarChange} className="hidden" />
                    </label>
                  </div>
                  {profileForm.avatarUrl && (
                    <button
                      type="button"
                      onClick={handleAvatarRemove}
                      className="mt-3 inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white/75 px-3 py-2 text-sm font-semibold text-red-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove photo
                    </button>
                  )}
                  <h3 className="mt-4 text-lg font-black text-navy-900">{profileForm.name || "Your profile"}</h3>
                  <p className="mt-1 max-w-full truncate text-sm text-slate-500">{profileForm.email}</p>
                  <span className={`mt-3 rounded-full px-3 py-1 text-xs font-black capitalize ${roleBadgeClassName[user?.role] || roleBadgeClassName.user}`}>
                    {user?.role}
                  </span>
                </div>

                <dl className="mt-6 space-y-3 rounded-2xl bg-white/65 p-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Account type</dt>
                    <dd className="font-bold capitalize text-navy-900">{user?.role || "user"}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Joined</dt>
                    <dd className="font-bold text-navy-900">
                      {user?.createdAt ? formatInvitationTime(user.createdAt) : "Not available"}
                    </dd>
                  </div>
                </dl>
              </aside>

              <form onSubmit={handleProfileSave} className="rounded-3xl border border-white/70 bg-white/70 p-5 shadow-sm">
                {profileError && (
                  <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {profileError}
                  </div>
                )}
                {profileMessage && (
                  <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    {profileMessage}
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="profileName" className="block text-sm font-bold text-slate-700">
                      Full name
                    </label>
                    <input
                      id="profileName"
                      name="name"
                      value={profileForm.name}
                      onChange={handleProfileChange}
                      required
                      className="field-input"
                    />
                  </div>
                  <div>
                    <label htmlFor="profileEmail" className="block text-sm font-bold text-slate-700">
                      Email
                    </label>
                    <input
                      id="profileEmail"
                      name="email"
                      type="email"
                      value={profileForm.email}
                      onChange={handleProfileChange}
                      required
                      className="field-input"
                    />
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-violet-100 bg-gradient-to-br from-white to-lavender-200/20 p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <UserCircle className="h-5 w-5 text-lavender-500" />
                    <h3 className="font-black text-navy-900">Change password</h3>
                  </div>
                  <div className="grid gap-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="newPassword" className="block text-sm font-bold text-slate-700">
                          New password
                        </label>
                        <PasswordField
                          id="newPassword"
                          name="newPassword"
                          value={profileForm.newPassword}
                          onChange={handleProfileChange}
                          minLength="7"
                          autoComplete="new-password"
                        />
                      </div>
                      <div>
                        <label htmlFor="confirmPassword" className="block text-sm font-bold text-slate-700">
                          Retype new password
                        </label>
                        <PasswordField
                          id="confirmPassword"
                          name="confirmPassword"
                          value={profileForm.confirmPassword}
                          onChange={handleProfileChange}
                          minLength="7"
                          autoComplete="new-password"
                        />
                      </div>
                    </div>
                    <p className="text-xs font-medium text-slate-500">{passwordRequirementText}</p>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setIsProfileSettingsOpen(false)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button type="submit" disabled={isProfileSaving} className="btn-primary">
                    {isProfileSaving ? <Loader label="Saving profile" size="sm" /> : <Save className="h-4 w-4" />}
                    Save changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <main className="app-content mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
