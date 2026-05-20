import { useCallback, useEffect, useState, useRef } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  Clock3,
  DoorOpen,
  History,
  MessageSquare,
  MicOff,
  MonitorUp,
  PlayCircle,
  Plus,
  Send,
  Trash2,
  Users,
  Video,
} from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import api from "../api/api";
import ActivityTimeline from "../components/ActivityTimeline";
import ChatBox from "../components/ChatBox";
import { useAuth } from "../hooks/useAuth";
import { io } from "socket.io-client";

const roleBadgeClass = {
  admin: "bg-rose-100 text-rose-700",
  moderator: "bg-sky-100 text-sky-700",
  user: "bg-slate-100 text-slate-700",
};

const formatMeetingTime = (value) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const formatMeetingDuration = (meeting) => {
  const seconds =
    meeting.durationSeconds ??
    Math.max(
      Math.floor(((meeting.endedAt ? new Date(meeting.endedAt) : new Date()) - new Date(meeting.startedAt)) / 1000),
      0
    );
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes < 1) return `${remainingSeconds}s`;
  return `${minutes}m ${remainingSeconds}s`;
};

const upsertMeeting = (currentMeetings, meeting) => [
  meeting,
  ...currentMeetings.filter((currentMeeting) => currentMeeting.id !== meeting.id),
];

const sortMeetingsLatestFirst = (meetingsToSort) =>
  [...meetingsToSort].sort((a, b) => {
    const getMeetingTime = (meeting) =>
      new Date(meeting.endedAt || meeting.startedAt || meeting.scheduledFor || meeting.createdAt || 0).getTime();

    return getMeetingTime(b) - getMeetingTime(a);
  });

const getMeetingCreator = (meeting) =>
  meeting.startedBy?.name || meeting.scheduledBy?.name || "Unknown";

const MeetingStatusBadge = ({ status }) => {
  const classes = {
    scheduled: "bg-lavender-200/70 text-navy-900",
    active: "bg-emerald-100 text-emerald-700 ring-4 ring-emerald-300/25",
    ended: "bg-slate-100 text-slate-600",
  };
  const labels = {
    scheduled: "Scheduled",
    active: "LIVE",
    ended: "Completed",
  };

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${classes[status] || classes.ended}`}>
      {labels[status] || status}
    </span>
  );
};

const formatLiveDuration = (startedAt, now) => {
  if (!startedAt) return "0m";

  const seconds = Math.max(Math.floor((now - new Date(startedAt)) / 1000), 0);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;

  return `${seconds}s`;
};

const emptyScheduleForm = {
  title: "",
  date: "",
  time: "",
  description: "",
};

const getTodayInputDate = () => {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);

  return localDate.toISOString().slice(0, 10);
};

const tabs = [
  { id: "chat", label: "Chat" },
  { id: "meetings", label: "Meetings" },
  { id: "activity", label: "Activity" },
];

const ParticipantModerationMenu = ({ roomId, member, onRemoved }) => {
  const socketRef = useRef(null);
  const menuRef = useRef(null);
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [isRemoveConfirmOpen, setIsRemoveConfirmOpen] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");

  useEffect(() => {
    if (!token) return;

    socketRef.current = io("http://localhost:5000", { auth: { token } });
    socketRef.current.on("connect_error", () => {});

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleOutsideClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [open]);

  const emit = (event, payload) =>
    new Promise((resolve) => {
      socketRef.current?.emit(event, payload, (response) => resolve(response));
    });

  const handleKick = async () => {
    setIsRemoving(true);
    setRemoveError("");
    const res = await emit("kick-user", { roomId, targetUserId: member._id || member.id });

    if (!res?.ok) {
      setRemoveError(res?.message || "Could not remove user");
      setIsRemoving(false);
      return;
    }

    setIsRemoving(false);
    setIsRemoveConfirmOpen(false);
    setOpen(false);
    onRemoved?.(member._id || member.id);
  };

  return (
    <div className="mt-2 flex items-center justify-end">
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setOpen((s) => !s)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
        >
          •••
        </button>
        {open && (
          <div className="absolute right-0 mt-2 w-48 rounded-md border bg-white shadow-md">
            <button
              type="button"
              onClick={() => {
                setRemoveError("");
                setIsRemoveConfirmOpen(true);
              }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              Remove
            </button>
          </div>
        )}
      </div>

      {isRemoveConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/70 bg-white/95 p-6 shadow-lift backdrop-blur-2xl">
            <div className="flex items-start gap-4">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-red-50 text-red-600 ring-1 ring-red-100">
                <Users className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-black text-navy-900">Remove participant?</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Are you sure you want to remove {member.name} from this room? They will be notified.
                </p>
              </div>
            </div>

            {removeError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {removeError}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsRemoveConfirmOpen(false)}
                className="btn-secondary"
              >
                No, keep user
              </button>
              <button
                type="button"
                onClick={handleKick}
                disabled={isRemoving}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-900"
              >
                {isRemoving ? "Removing..." : "Yes, remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const RoomDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, token } = useAuth();
  const [room, setRoom] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteDescription, setInviteDescription] = useState("");
  const [roomInvitations, setRoomInvitations] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [activities, setActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [invitingUserId, setInvitingUserId] = useState("");
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "chat");
  const [isStartingMeeting, setIsStartingMeeting] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState(emptyScheduleForm);
  const [scheduleError, setScheduleError] = useState("");
  const [isSchedulingMeeting, setIsSchedulingMeeting] = useState(false);
  const [meetingToDelete, setMeetingToDelete] = useState(null);
  const [isClearActivityConfirmOpen, setIsClearActivityConfirmOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const contentScrollRef = useRef(null);
  const activityScrollRef = useRef(null);

  const canInvite = user?.role === "admin" || user?.role === "moderator";
  const canManageMeetings = user?.role === "admin" || user?.role === "moderator";
  const todayInputDate = getTodayInputDate();

  const fetchRoomInvitations = useCallback(async () => {
    if (!canInvite) {
      return;
    }

    try {
      const { data } = await api.get(`/invitations/room/${id}`);
      setRoomInvitations(data);
    } catch {
      setRoomInvitations([]);
    }
  }, [canInvite, id]);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");

    if (requestedTab && tabs.some((tab) => tab.id === requestedTab)) {
      const timeoutId = window.setTimeout(() => {
        setActiveTab(requestedTab);
      }, 0);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    return undefined;
  }, [searchParams]);

  useEffect(() => {
    let isMounted = true;

    const fetchRoom = async () => {
      try {
        const [
          { data: roomData },
          { data: meetingsData },
          { data: activityData },
        ] = await Promise.all([
          api.get(`/rooms/${id}`),
          api.get(`/rooms/${id}/meetings`),
          api.get(`/rooms/${id}/activity`),
        ]);

        if (isMounted) {
          setRoom(roomData);
          setMeetings(meetingsData);
          setActivities(activityData);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.response?.data?.message || "Could not load room.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchRoom();

    return () => {
      isMounted = false;
    };
  }, [id]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "activity") {
      return;
    }

    window.requestAnimationFrame(() => {
      if (contentScrollRef.current) {
        contentScrollRef.current.scrollTop = 0;
      }

      if (activityScrollRef.current) {
        activityScrollRef.current.scrollTop = 0;
      }
    });
  }, [activeTab]);

  useEffect(() => {
    if (!token || !id) return undefined;

    const socket = io("http://localhost:5000", { auth: { token } });

    socket.on("connect", () => {
      socket.emit("subscribe-activity", { roomId: id });
    });

    socket.on("activity-created", (activity) => {
      if (activity.room?.id && activity.room.id !== id) {
        return;
      }

      setActivities((currentActivities) => [
        activity,
        ...currentActivities.filter((item) => item.id !== activity.id),
      ].slice(0, 50));
    });

    const handleMeetingUpdate = ({ roomId, meeting }) => {
      if (roomId !== id || !meeting) {
        return;
      }

      setMeetings((currentMeetings) => upsertMeeting(currentMeetings, meeting));
    };

    socket.on("room-meeting-scheduled", handleMeetingUpdate);
    socket.on("room-meeting-updated", handleMeetingUpdate);
    socket.on("room-meeting-deleted", ({ roomId, meetingId }) => {
      if (roomId !== id) {
        return;
      }

      setMeetings((currentMeetings) => currentMeetings.filter((meeting) => meeting.id !== meetingId));
    });
    socket.on("room-activity-cleared", ({ roomId }) => {
      if (roomId === id) {
        setActivities([]);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [id, token]);

  useEffect(() => {
    if (!canInvite) {
      return undefined;
    }

    let isMounted = true;

    const fetchUsers = async () => {
      try {
        const [{ data: usersData }, { data: invitationsData }] = await Promise.all([
          api.get("/users"),
          api.get(`/invitations/room/${id}`),
        ]);

        if (isMounted) {
          setUsers(usersData);
          setRoomInvitations(invitationsData);
        }
      } catch {
        if (isMounted) {
          setUsers([]);
          setRoomInvitations([]);
        }
      }
    };

    fetchUsers();

    return () => {
      isMounted = false;
    };
  }, [canInvite, id]);

  useEffect(() => {
    if (isInviteOpen) {
      const timeoutId = window.setTimeout(() => {
        fetchRoomInvitations();
        setInviteError("");
        setInviteMessage("");
      }, 0);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    return undefined;
  }, [fetchRoomInvitations, isInviteOpen]);

  useEffect(() => {
    const handleInvitationStatusUpdate = (event) => {
      const invitation = event.detail;

      if (invitation?.room?.id !== id) {
        return;
      }

      setRoomInvitations((currentInvitations) =>
        currentInvitations.some((currentInvitation) => currentInvitation.id === invitation.id)
          ? currentInvitations.map((currentInvitation) =>
              currentInvitation.id === invitation.id ? invitation : currentInvitation
            )
          : [invitation, ...currentInvitations]
      );

      if (invitation.status === "accepted" && invitation.invitedUser) {
        setRoom((currentRoom) => {
          if (
            !currentRoom ||
            currentRoom.assignedUsers?.some((member) => (member._id || member.id) === invitation.invitedUser.id)
          ) {
            return currentRoom;
          }

          return {
            ...currentRoom,
            assignedUsers: [...(currentRoom.assignedUsers || []), invitation.invitedUser],
          };
        });
      }
    };

    window.addEventListener("room-invitation-status-updated", handleInvitationStatusUpdate);

    return () => {
      window.removeEventListener("room-invitation-status-updated", handleInvitationStatusUpdate);
    };
  }, [id]);

  const handleOnlineUsersChange = useCallback((users) => {
    setOnlineUsers(users);
  }, []);

  const handleParticipantsChange = useCallback((participants) => {
    setRoom((currentRoom) => {
      if (!currentRoom) {
        return currentRoom;
      }

      return {
        ...currentRoom,
        members: participants,
      };
    });
  }, []);

  const handleInviteUser = async (invitedUserId) => {
    setInviteError("");
    setInviteMessage("");
    setInvitingUserId(invitedUserId);

    try {
      const { data } = await api.post("/invitations", {
        roomId: room._id,
        invitedUserId,
        description: inviteDescription,
      });

      setRoomInvitations((currentInvitations) => [data, ...currentInvitations]);
      setInviteMessage("Invitation sent.");
      setInviteDescription("");
      fetchRoomInvitations();
    } catch (err) {
      setInviteError(err.response?.data?.message || "Could not send invitation.");
    } finally {
      setInvitingUserId("");
    }
  };

  if (isLoading) {
    return <p className="text-slate-600">Loading room...</p>;
  }

  if (error) {
    return (
      <section className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-700">
        <p>{error}</p>
        <Link to="/rooms" className="mt-3 inline-block text-sm font-medium underline">
          Back to rooms
        </Link>
      </section>
    );
  }

  const isOpenRoom = room.isOpenToEveryone ?? !room.isPrivate;
  const roomInvitationByUserId = new Map(
    roomInvitations.reduce((invitationsByUser, invitation) => {
      const invitedUserId = invitation.invitedUser?.id;

      if (invitedUserId && !invitationsByUser.some((item) => item.invitedUser?.id === invitedUserId)) {
        invitationsByUser.push(invitation);
      }

      return invitationsByUser;
    }, []).map((invitation) => [invitation.invitedUser?.id, invitation])
  );
  const participantMap = new Map();

  (room.assignedUsers || []).forEach((member) => {
    participantMap.set(member._id || member.id, member);
  });

  (room.members || []).forEach((member) => {
    participantMap.set(member._id || member.id, member);
  });

  const participants = Array.from(participantMap.values());
  const upcomingMeetings = [...meetings.filter((meeting) => meeting.status === "scheduled")].sort(
    (a, b) => new Date(b.scheduledFor || 0).getTime() - new Date(a.scheduledFor || 0).getTime()
  );
  const activeMeetings = sortMeetingsLatestFirst(meetings.filter((meeting) => meeting.status === "active"));
  const activeMeeting = activeMeetings[0];
  const endedMeetings = sortMeetingsLatestFirst(meetings.filter((meeting) => meeting.status === "ended"));
  const activeMeetingStatus = activeMeeting ? "Meeting in progress" : "No active meeting";
  const handleStartMeeting = async (scheduledMeetingId = null) => {
    if (!canManageMeetings) {
      if (activeMeeting) {
        navigate(`/rooms/${room._id}/meeting/${activeMeeting.id}`);
      }

      return;
    }

    setIsStartingMeeting(true);
    setError("");

    try {
      if (activeMeeting) {
        navigate(`/rooms/${room._id}/meeting/${activeMeeting.id}`);
        return;
      }

      const { data } = await api.post(`/rooms/${room._id}/meetings`, {
        scheduledMeetingId,
      });
      setMeetings((currentMeetings) => upsertMeeting(currentMeetings, data));
      navigate(`/rooms/${room._id}/meeting/${data.id}`);
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.meeting?.id) {
        navigate(`/rooms/${room._id}/meeting/${err.response.data.meeting.id}`);
        return;
      }

      setError(err.response?.data?.message || "Could not start meeting.");
      setActiveTab("meetings");
    } finally {
      setIsStartingMeeting(false);
    }
  };

  const handleScheduleChange = (event) => {
    const { name, value } = event.target;
    setScheduleForm((currentForm) => ({ ...currentForm, [name]: value }));
  };

  const handleScheduleMeeting = async (event) => {
    event.preventDefault();
    if (!canManageMeetings) return;

    setScheduleError("");
    setIsSchedulingMeeting(true);

    try {
      const { data } = await api.post(`/rooms/${room._id}/meetings/schedule`, scheduleForm);
      setMeetings((currentMeetings) => upsertMeeting(currentMeetings, data));
      setScheduleForm(emptyScheduleForm);
      setIsScheduleOpen(false);
      setActiveTab("meetings");
    } catch (err) {
      setScheduleError(err.response?.data?.message || "Could not schedule meeting.");
    } finally {
      setIsSchedulingMeeting(false);
    }
  };

  const handleDeleteMeeting = async () => {
    if (!meetingToDelete) return;
    try {
      await api.delete(`/rooms/${room._id}/meetings/${meetingToDelete.id}`);
      setMeetings((currentMeetings) => currentMeetings.filter((meeting) => meeting.id !== meetingToDelete.id));
      setMeetingToDelete(null);
    } catch (err) {
      setError(err.response?.data?.message || "Could not delete meeting.");
      setActiveTab("meetings");
    }
  };

  const handleClearActivity = async () => {
    try {
      await api.delete(`/rooms/${room._id}/activity`);
      setActivities([]);
      setIsClearActivityConfirmOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || "Could not clear activity.");
      setActiveTab("activity");
    }
  };

  return (
    <section className="space-y-6">
      <Link to="/rooms" className="inline-flex items-center gap-2 text-sm font-bold text-navy-900 hover:text-lavender-500">
        <ChevronLeft className="h-4 w-4" />
        Back to rooms
      </Link>

      <div className="page-hero">
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <div>
            <p className="section-kicker">Room</p>
            <h1 className="mt-2 text-4xl font-black text-navy-900">{room.name}</h1>
            <p className="mt-3 max-w-2xl text-slate-600">{room.description || "No description"}</p>

            <div className="mt-4 flex w-fit flex-wrap gap-2">
              <span
                className={`status-pill ${
                  isOpenRoom ? "bg-mint-300/35 text-emerald-800" : "bg-lavender-200/50 text-navy-900"
                }`}
              >
                <DoorOpen className="h-3.5 w-3.5" />
                {isOpenRoom ? "Open Room" : "Restricted Room"}
              </span>
              {canInvite && (
                <button
                  type="button"
                  onClick={() => setIsInviteOpen(true)}
                  className="btn-secondary py-1.5"
                >
                  <Send className="h-4 w-4" />
                  Invite Users
                </button>
              )}
            </div>
          </div>

          <div className="glass-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="section-kicker">Meeting</p>
                <p className="mt-1 text-sm font-bold text-navy-900">{activeMeetingStatus}</p>
              </div>
              <span className="status-pill">
                Workspace
              </span>
            </div>
            <div className="mt-4 rounded-2xl bg-white/75 px-3 py-2 ring-1 ring-white/70">
              <p className="text-xs text-slate-500">Next scheduled meeting</p>
              <p className="mt-1 text-sm font-medium text-slate-900">
              {activeMeeting
                ? `Started ${formatMeetingTime(activeMeeting.startedAt)}`
                : upcomingMeetings[0]
                  ? `${upcomingMeetings[0].title} - ${formatMeetingTime(upcomingMeetings[0].scheduledFor)}`
                  : "No meetings scheduled"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleStartMeeting()}
              disabled={isStartingMeeting}
              className={`${activeMeeting || canManageMeetings ? "btn-primary" : "hidden"} mt-4 w-full`}
            >
              <Video className="h-4 w-4" />
              {isStartingMeeting ? "Starting..." : activeMeeting ? "Join Meeting" : "Start Meeting"}
            </button>
          </div>
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="glass-panel p-4">
            <dt className="text-sm text-slate-500">Created by</dt>
            <dd className="mt-1 font-semibold">{room.createdBy?.name || "Unknown"}</dd>
          </div>
          <div className="glass-panel p-4">
            <dt className="text-sm text-slate-500">Members</dt>
            <dd className="mt-1 font-semibold">{participants.length}</dd>
          </div>
          <div className="glass-panel p-4">
            <dt className="text-sm text-slate-500">Room ID</dt>
            <dd className="mt-1 truncate font-semibold">{room._id}</dd>
          </div>
        </dl>
      </div>


      {activeMeeting && (
        <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-emerald-900">Active meeting in progress</p>
              <p className="mt-1 text-sm text-emerald-700">
                Started by {activeMeeting.startedBy?.name || "Unknown"} at {formatMeetingTime(activeMeeting.startedAt)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/rooms/${room._id}/meeting/${activeMeeting.id}`)}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
            >
              Join Meeting
            </button>
          </div>
        </div>
      )}
      {isInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Invite Users</h2>
                <p className="mt-1 text-sm text-slate-600">Send a room invitation notification.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsInviteOpen(false)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            {inviteError && (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {inviteError}
              </div>
            )}

            {inviteMessage && (
              <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {inviteMessage}
              </div>
            )}

            <div className="mb-4">
              <label htmlFor="inviteDescription" className="block text-sm font-medium text-slate-700">
                Invitation description
              </label>
              <textarea
                id="inviteDescription"
                value={inviteDescription}
                onChange={(event) => setInviteDescription(event.target.value)}
                rows="3"
                placeholder={room.description || "Add context for this invitation"}
                className="field-input"
              />
            </div>

            <div className="scroll-panel max-h-96 space-y-2">
              {users.length ? (
                users.map((member) => {
                  const invitation = roomInvitationByUserId.get(member._id);
                  const invitationStatus = invitation?.status;
                  const alwaysHasAccess = member.role === "admin" || member.role === "moderator";
                  const isSelf = member._id === user?.id;
                  const isDisabled =
                    alwaysHasAccess ||
                    isSelf ||
                    invitationStatus === "pending" ||
                    invitationStatus === "accepted" ||
                    invitingUserId === member._id;

                  return (
                    <div
                      key={member._id}
                      className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/70 px-3 py-2 shadow-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{member.name}</p>
                        <p className="truncate text-xs text-slate-500">{member.email}</p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          roleBadgeClass[member.role] || roleBadgeClass.user
                        }`}
                      >
                        {member.role}
                      </span>
                      <button
                        type="button"
                        disabled={isDisabled}
                        onClick={() => handleInviteUser(member._id)}
                        className="btn-primary px-3 py-1.5 text-xs disabled:bg-slate-300"
                      >
                        {alwaysHasAccess
                          ? "Always access"
                          : invitationStatus === "pending"
                            ? "Pending"
                            : invitationStatus === "accepted"
                              ? "Accepted"
                              : invitingUserId === member._id
                                ? "Sending..."
                                : "Invite"}
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  No users available.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {isScheduleOpen && canManageMeetings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/70 bg-white/95 p-6 shadow-lift backdrop-blur-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-navy-900">Schedule Meeting</h2>
                <p className="mt-1 text-sm text-slate-600">Add a future meeting to this room.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsScheduleOpen(false)}
                className="btn-secondary px-3 py-1.5"
              >
                Close
              </button>
            </div>

            {scheduleError && (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {scheduleError}
              </div>
            )}

            <form onSubmit={handleScheduleMeeting} className="space-y-4">
              <div>
                <label htmlFor="meetingTitle" className="block text-sm font-medium text-slate-700">
                  Title
                </label>
                <input
                  id="meetingTitle"
                  name="title"
                  value={scheduleForm.title}
                  onChange={handleScheduleChange}
                  required
                  className="field-input"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="meetingDate" className="block text-sm font-medium text-slate-700">
                    Date
                  </label>
                  <input
                    id="meetingDate"
                    name="date"
                    type="date"
                    value={scheduleForm.date}
                    onChange={handleScheduleChange}
                    min={todayInputDate}
                    required
                    className="field-input"
                  />
                </div>
                <div>
                  <label htmlFor="meetingTime" className="block text-sm font-medium text-slate-700">
                    Time
                  </label>
                  <input
                    id="meetingTime"
                    name="time"
                    type="time"
                    value={scheduleForm.time}
                    onChange={handleScheduleChange}
                    required
                    className="field-input"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="meetingDescription" className="block text-sm font-medium text-slate-700">
                  Description
                </label>
                <textarea
                  id="meetingDescription"
                  name="description"
                  value={scheduleForm.description}
                  onChange={handleScheduleChange}
                  rows="3"
                  className="field-input"
                />
              </div>
              <button type="submit" disabled={isSchedulingMeeting} className="btn-primary w-full">
                <CalendarClock className="h-4 w-4" />
                {isSchedulingMeeting ? "Scheduling..." : "Schedule Meeting"}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr] lg:h-[calc(100vh-21rem)] lg:min-h-[34rem]">
        <aside className="soft-panel flex min-h-0 flex-col p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="inline-flex items-center gap-2 font-black text-navy-900">
              <Users className="h-4 w-4" />
              Participants
            </h2>
            <span className="status-pill">
              {participants.length} total
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">{onlineUsers.length} online now</p>
          <div className="scroll-panel mt-4 max-h-[20rem] min-h-0 space-y-3 lg:flex-1">
            {participants.length ? (
              participants.map((member) => {
                const memberId = member._id || member.id;
                const isOnline =
                  member.status === "online" ||
                  onlineUsers.some((onlineUser) => onlineUser.id === memberId);

                return (
                  <div
                    key={memberId}
                    className="rounded-2xl border border-white/70 bg-white/65 px-3 py-2 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{member.name}</p>
                        <p className="text-xs text-slate-500">{member.role}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {member.muted && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                            <MicOff className="h-3 w-3" />
                            Muted
                          </span>
                        )}
                        {member.screenShareBlocked && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
                            <MonitorUp className="h-3 w-3" />
                            Screen blocked
                          </span>
                        )}
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                            isOnline ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {isOnline ? "Online" : "Offline"}
                        </span>
                      </div>
                    </div>

                    {/* moderation menu for admins/moderators */}
                    {(user?.role === "admin" || user?.role === "moderator") && user?.id !== memberId && (
                      <ParticipantModerationMenu
                        roomId={room._id}
                        member={member}
                        onRemoved={(removedMemberId) => {
                          setRoom((currentRoom) =>
                            currentRoom
                              ? {
                                  ...currentRoom,
                                  assignedUsers: (currentRoom.assignedUsers || []).filter(
                                    (assignedUser) => (assignedUser._id || assignedUser.id) !== removedMemberId
                                  ),
                                  members: (currentRoom.members || []).filter(
                                    (roomMember) => (roomMember._id || roomMember.id) !== removedMemberId
                                  ),
                                }
                              : currentRoom
                          );
                        }}
                      />
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-slate-600">Participants will appear here.</p>
            )}
          </div>

          {canInvite && roomInvitations.length > 0 && (
            <div className="mt-6 border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">Invited Users</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {roomInvitations.length}
                </span>
              </div>
              <div className="scroll-panel mt-3 max-h-56 space-y-3">
                {roomInvitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="rounded-md border border-slate-100 bg-white px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-medium">
                        {invitation.invitedUser?.name || "Unknown"}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          invitation.status === "accepted"
                            ? "bg-emerald-100 text-emerald-700"
                            : invitation.status === "pending"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {invitation.status}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-slate-500">
                        {invitation.invitedUser?.email || "No email"}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          roleBadgeClass[invitation.invitedUser?.role] || roleBadgeClass.user
                        }`}
                      >
                        {invitation.invitedUser?.role || "user"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        <main className="soft-panel flex min-h-0 min-w-0 flex-col overflow-hidden">
          <div className="border-b border-white/70 px-5 pt-5">
            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-t-md px-4 py-2 text-sm font-medium transition ${
                    activeTab === tab.id
                      ? "bg-navy-900 text-white shadow-soft"
                      : "text-slate-600 hover:bg-white/70 hover:text-navy-900"
                  }`}
                >
                  {tab.id === "chat" && <MessageSquare className="mr-2 inline h-4 w-4" />}
                  {tab.id === "meetings" && <CalendarClock className="mr-2 inline h-4 w-4" />}
                  {tab.id === "activity" && <Activity className="mr-2 inline h-4 w-4" />}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div ref={contentScrollRef} className="scroll-panel min-h-0 flex-1 p-5">
            {activeTab === "chat" && (
              <ChatBox
                roomId={room._id}
                onOnlineUsersChange={handleOnlineUsersChange}
                onParticipantsChange={handleParticipantsChange}
              />
            )}

            {activeTab === "meetings" && (
              <section className="space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-black text-navy-900">Meetings</h2>
                    <p className="mt-1 text-sm text-slate-500">Schedule, join, and review room meetings.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canManageMeetings && (
                      <button
                        type="button"
                        onClick={() => setIsScheduleOpen(true)}
                        className="btn-secondary"
                      >
                        <Plus className="h-4 w-4" />
                        Schedule Meeting
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleStartMeeting()}
                      disabled={isStartingMeeting}
                      className={activeMeeting || canManageMeetings ? "btn-primary" : "hidden"}
                    >
                      <Video className="h-4 w-4" />
                      {isStartingMeeting ? "Starting..." : activeMeeting ? "Join Meeting" : "Start Meeting"}
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="glass-panel p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="inline-flex items-center gap-2 font-semibold text-slate-900">
                        <CalendarClock className="h-4 w-4 text-lavender-500" />
                        Upcoming Meetings
                      </h3>
                      <span className="status-pill">{upcomingMeetings.length}</span>
                    </div>
                    <div className="scroll-panel mt-4 max-h-48 space-y-2">
                      {upcomingMeetings.length ? (
                        upcomingMeetings.map((meeting) => (
                          <div key={meeting.id} className="rounded-2xl border border-white/70 bg-white/70 px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft">
                            <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_0.8fr_auto] lg:items-center">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black text-navy-900">{meeting.title}</p>
                                {meeting.description && <p className="mt-1 truncate text-xs text-slate-500">{meeting.description}</p>}
                              </div>
                              <p className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                                <CalendarClock className="h-3.5 w-3.5" />
                                {formatMeetingTime(meeting.scheduledFor)}
                              </p>
                              <p className="truncate text-xs text-slate-500">By {getMeetingCreator(meeting)}</p>
                              <div className="flex items-center gap-2 lg:justify-end">
                                <MeetingStatusBadge status={meeting.status} />
                                {canManageMeetings && (
                                  <button
                                    type="button"
                                    onClick={() => handleStartMeeting(meeting.id)}
                                    disabled={!!activeMeeting || isStartingMeeting}
                                    className="btn-primary px-3 py-1.5 text-xs disabled:bg-slate-300"
                                  >
                                    <PlayCircle className="h-3.5 w-3.5" />
                                    Start
                                  </button>
                                )}
                                {canInvite && (
                                  <button
                                    type="button"
                                    onClick={() => setMeetingToDelete(meeting)}
                                    className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:-translate-y-0.5 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
                          <p className="text-sm font-medium text-slate-700">No upcoming meetings</p>
                          <p className="mt-1 text-sm text-slate-500">Scheduled meetings will appear here.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="glass-panel p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="inline-flex items-center gap-2 font-semibold text-slate-900">
                        <Video className="h-4 w-4 text-mint-500" />
                        Active Meetings
                      </h3>
                      <span className="status-pill">{activeMeetings.length} active</span>
                    </div>
                    <div className="scroll-panel mt-4 max-h-44 space-y-2">
                      {activeMeetings.length ? (
                        activeMeetings.map((meeting) => (
                          <div key={meeting.id} className="rounded-2xl border border-mint-300/60 bg-mint-300/20 px-4 py-3 shadow-sm ring-4 ring-mint-300/10 transition hover:-translate-y-0.5 hover:shadow-soft">
                            <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_0.8fr_auto] lg:items-center">
                              <div className="min-w-0">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  <p className="truncate text-sm font-black text-navy-900">{meeting.title}</p>
                                  <span className="animate-pulseSoft rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-black text-emerald-700">LIVE</span>
                                </div>
                                <p className="mt-1 truncate text-xs text-slate-600">Started by {getMeetingCreator(meeting)}</p>
                              </div>
                              <p className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                                <Clock3 className="h-3.5 w-3.5" />
                                {formatLiveDuration(meeting.startedAt, now)}
                              </p>
                              <p className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                                <Users className="h-3.5 w-3.5" />
                                {meeting.activeParticipantCount ?? meeting.participantCount ?? 0} participants
                              </p>
                              <div className="flex items-center gap-2 lg:justify-end">
                                <MeetingStatusBadge status={meeting.status} />
                                <button
                                  type="button"
                                  onClick={() => navigate(`/rooms/${room._id}/meeting/${meeting.id}`)}
                                  className="btn-primary bg-emerald-700 px-3 py-1.5 text-xs hover:bg-emerald-800"
                                >
                                  <Video className="h-3.5 w-3.5" />
                                  Join
                                </button>
                                {canInvite && (
                                  <button
                                    type="button"
                                    onClick={() => setMeetingToDelete(meeting)}
                                    className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:-translate-y-0.5 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
                          <p className="text-sm font-medium text-slate-700">No active meetings</p>
                          <p className="mt-1 text-sm text-slate-500">Only one meeting can be active at a time.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="glass-panel p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="inline-flex items-center gap-2 font-semibold text-slate-900">
                        <History className="h-4 w-4 text-lavender-500" />
                        Meeting History
                      </h3>
                      <span className="status-pill">{endedMeetings.length} past</span>
                    </div>
                    <div className="scroll-panel mt-4 max-h-60 space-y-2">
                      {endedMeetings.length ? (
                        endedMeetings.map((meeting) => (
                          <div key={meeting.id} className="rounded-2xl border border-white/70 bg-white/65 px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft">
                            <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_0.8fr_auto] lg:items-center">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black text-navy-900">{meeting.title}</p>
                                <p className="mt-1 truncate text-xs text-slate-500">By {getMeetingCreator(meeting)}</p>
                              </div>
                              <p className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                                <Clock3 className="h-3.5 w-3.5" />
                                {formatMeetingDuration(meeting)}
                              </p>
                              <p className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                                <Users className="h-3.5 w-3.5" />
                                {meeting.participantCount ?? meeting.participants?.length ?? 0}
                              </p>
                              <div className="flex items-center gap-2 lg:justify-end">
                                <MeetingStatusBadge status={meeting.status} />
                                <span className="text-xs text-slate-500">
                                  {meeting.endedAt ? formatMeetingTime(meeting.endedAt) : "Completed"}
                                </span>
                                {canInvite && (
                                  <button
                                    type="button"
                                    onClick={() => setMeetingToDelete(meeting)}
                                    className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:-translate-y-0.5 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
                          <p className="text-sm font-medium text-slate-700">No meeting history</p>
                          <p className="mt-1 text-sm text-slate-500">Completed meetings will appear here.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeTab === "activity" && (
              <section>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Activity</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Room events, presence, invitations, and moderation updates.
                    </p>
                  </div>
                  <div className="flex w-fit items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                      {activities.length} events
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsClearActivityConfirmOpen(true)}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:-translate-y-0.5 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Clear Activity
                    </button>
                  </div>
                </div>

                <div ref={activityScrollRef} className="scroll-panel mt-5 max-h-[34rem]">
                  <ActivityTimeline activities={activities} emptyTitle="No room activity yet" />
                </div>
              </section>
            )}
          </div>
        </main>
      </div>

      {(meetingToDelete || isClearActivityConfirmOpen) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/70 bg-white/95 p-6 shadow-lift backdrop-blur-2xl">
            <div className="flex items-start gap-4">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-red-50 text-red-600 ring-1 ring-red-100">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-black text-navy-900">
                  {meetingToDelete ? "Delete meeting?" : "Clear activity?"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {meetingToDelete
                    ? `Are you sure you want to delete "${meetingToDelete.title}"? This cannot be undone.`
                    : "Are you sure you want to clear this room's activity timeline? This cannot be undone."}
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setMeetingToDelete(null);
                  setIsClearActivityConfirmOpen(false);
                }}
                className="btn-secondary"
              >
                No, keep it
              </button>
              <button
                type="button"
                onClick={meetingToDelete ? handleDeleteMeeting : handleClearActivity}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-red-500"
              >
                <Trash2 className="h-4 w-4" />
                Yes, {meetingToDelete ? "delete" : "clear"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default RoomDetails;
