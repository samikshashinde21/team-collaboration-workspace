import { useCallback, useEffect, useState, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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

const tabs = [
  { id: "chat", label: "Chat" },
  { id: "meetings", label: "Meetings" },
  { id: "activity", label: "Activity" },
];

const ParticipantModerationMenu = ({ roomId, member, currentUser }) => {
  const socketRef = useRef(null);
  const { token } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!token) return;

    socketRef.current = io("http://localhost:5000", { auth: { token } });
    socketRef.current.on("connect_error", () => {});

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  const emit = (event, payload) =>
    new Promise((resolve) => {
      socketRef.current?.emit(event, payload, (response) => resolve(response));
    });

  const handleMute = async () => {
    const res = await emit("mute-user", { roomId, targetUserId: member._id || member.id });
    setOpen(false);
    if (!res?.ok) alert(res?.message || "Could not mute user");
  };

  const handleUnmute = async () => {
    const res = await emit("unmute-user", { roomId, targetUserId: member._id || member.id });
    setOpen(false);
    if (!res?.ok) alert(res?.message || "Could not unmute user");
  };

  const handleKick = async () => {
    if (!window.confirm(`Remove ${member.name} from the room?`)) return;
    const res = await emit("kick-user", { roomId, targetUserId: member._id || member.id });
    setOpen(false);
    if (!res?.ok) alert(res?.message || "Could not remove user");
  };

  const handleToggleScreen = async () => {
    const allow = !!member.screenShareBlocked;
    const res = await emit("toggle-screen-share-permission", {
      roomId,
      targetUserId: member._id || member.id,
      allow: allow,
    });
    setOpen(false);
    if (!res?.ok) alert(res?.message || "Could not update screen share permission");
  };

  return (
    <div className="mt-2 flex items-center justify-end">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((s) => !s)}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
        >
          •••
        </button>
        {open && (
          <div className="absolute right-0 mt-2 w-48 rounded-md border bg-white shadow-md">
            <button onClick={member.muted ? handleUnmute : handleMute} className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
              {member.muted ? "Unmute" : "Mute"}
            </button>
            <button onClick={handleKick} className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
              Remove
            </button>
            <button onClick={handleToggleScreen} className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
              {member.screenShareBlocked ? "Allow Screen Share" : "Block Screen Share"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const RoomDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
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
  const [activeTab, setActiveTab] = useState("chat");
  const [isStartingMeeting, setIsStartingMeeting] = useState(false);

  const canInvite = user?.role === "admin" || user?.role === "moderator";

  useEffect(() => {
    let isMounted = true;

    const fetchRoom = async () => {
      try {
        const [{ data: roomData }, { data: meetingsData }, { data: activityData }] = await Promise.all([
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
    const handleInvitationStatusUpdate = (event) => {
      const invitation = event.detail;

      if (invitation?.room?.id !== id) {
        return;
      }

      setRoomInvitations((currentInvitations) =>
        currentInvitations.map((currentInvitation) =>
          currentInvitation.id === invitation.id ? invitation : currentInvitation
        )
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
    roomInvitations.map((invitation) => [invitation.invitedUser?.id, invitation])
  );
  const participantMap = new Map();

  (room.assignedUsers || []).forEach((member) => {
    participantMap.set(member._id || member.id, member);
  });

  (room.members || []).forEach((member) => {
    participantMap.set(member._id || member.id, member);
  });

  const participants = Array.from(participantMap.values());
  const activeMeetings = meetings.filter((meeting) => meeting.status === "active");
  const activeMeeting = activeMeetings[0];
  const endedMeetings = meetings.filter((meeting) => meeting.status === "ended");
  const activeMeetingStatus = activeMeeting ? "Meeting in progress" : "No active meeting";
  const handleStartMeeting = async () => {
    setIsStartingMeeting(true);
    setError("");

    try {
      if (activeMeeting) {
        navigate(`/rooms/${room._id}/meeting/${activeMeeting.id}`);
        return;
      }

      const { data } = await api.post(`/rooms/${room._id}/meetings`);
      setMeetings((currentMeetings) => [data, ...currentMeetings]);
      navigate(`/rooms/${room._id}/meeting/${data.id}`);
    } catch (err) {
      setError(err.response?.data?.message || "Could not start meeting.");
      setActiveTab("meetings");
    } finally {
      setIsStartingMeeting(false);
    }
  };

  return (
    <section>
      <Link to="/rooms" className="text-sm font-medium text-slate-600 underline">
        Back to rooms
      </Link>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Room</p>
            <h1 className="mt-2 text-3xl font-semibold">{room.name}</h1>
            <p className="mt-3 max-w-2xl text-slate-600">{room.description || "No description"}</p>

            <div className="mt-4 flex w-fit flex-wrap gap-2">
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  isOpenRoom ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                }`}
              >
                {isOpenRoom ? "Open Room" : "Restricted Room"}
              </span>
              {canInvite && (
                <button
                  type="button"
                  onClick={() => setIsInviteOpen(true)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Invite Users
                </button>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Meeting</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{activeMeetingStatus}</p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                Workspace
              </span>
            </div>
            <div className="mt-4 rounded-md bg-white px-3 py-2 ring-1 ring-slate-200">
              <p className="text-xs text-slate-500">Next scheduled meeting</p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {activeMeeting ? `Started ${formatMeetingTime(activeMeeting.startedAt)}` : "No meetings scheduled"}
              </p>
            </div>
            <button
              type="button"
              onClick={handleStartMeeting}
              disabled={isStartingMeeting}
              className="mt-4 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isStartingMeeting ? "Starting..." : activeMeeting ? "Join Meeting" : "Start Meeting"}
            </button>
          </div>
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-4">
            <dt className="text-sm text-slate-500">Created by</dt>
            <dd className="mt-1 font-semibold">{room.createdBy?.name || "Unknown"}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <dt className="text-sm text-slate-500">Members</dt>
            <dd className="mt-1 font-semibold">{room.members?.length || 0}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
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
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
            </div>

            <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
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
                      className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2"
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
                        className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
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

      <div className="mt-6 grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Participants</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
              {participants.length} total
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">{onlineUsers.length} online now</p>
          <div className="mt-4 space-y-3">
            {participants.length ? (
              participants.map((member) => {
                const memberId = member._id || member.id;
                const isOnline =
                  member.status === "online" ||
                  onlineUsers.some((onlineUser) => onlineUser.id === memberId);

                return (
                  <div
                    key={memberId}
                    className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{member.name}</p>
                        <p className="text-xs text-slate-500">{member.role}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {member.muted && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            Muted
                          </span>
                        )}
                        {member.screenShareBlocked && (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
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
                      <ParticipantModerationMenu roomId={room._id} member={member} currentUser={user} />
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
              <div className="mt-3 space-y-3">
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

        <main className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 pt-5">
            <div className="flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-t-md px-4 py-2 text-sm font-medium transition ${
                    activeTab === tab.id
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-5">
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
                    <h2 className="text-lg font-semibold text-slate-900">Meetings</h2>
                    <p className="mt-1 text-sm text-slate-500">Plan and review room meetings.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartMeeting}
                    disabled={isStartingMeeting}
                    className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {isStartingMeeting ? "Starting..." : activeMeeting ? "Join Meeting" : "Start Meeting"}
                  </button>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold text-slate-900">Active meetings</h3>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        {activeMeetings.length} active
                      </span>
                    </div>
                    <div className="mt-4 space-y-3">
                      {activeMeetings.length ? (
                        activeMeetings.map((meeting) => (
                          <div key={meeting.id} className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-sm font-medium text-slate-900">Started by {meeting.startedBy?.name || "Unknown"}</p>
                                <p className="mt-1 text-xs text-slate-600">{formatMeetingTime(meeting.startedAt)}</p>
                                <p className="mt-1 text-xs text-slate-600">
                                  {meeting.activeParticipantCount ?? meeting.participantCount ?? meeting.participants?.length ?? 0} participants - {formatMeetingDuration(meeting)}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => navigate(`/rooms/${room._id}/meeting/${meeting.id}`)}
                                className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                              >
                                Join
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                          <p className="text-sm font-medium text-slate-700">No active meetings</p>
                          <p className="mt-1 text-sm text-slate-500">Start a meeting when the room is ready.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold text-slate-900">Meeting history</h3>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        {endedMeetings.length} past
                      </span>
                    </div>
                    <div className="mt-4 space-y-3">
                      {endedMeetings.length ? (
                        endedMeetings.map((meeting) => (
                          <div key={meeting.id} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-sm font-medium text-slate-900">Started by {meeting.startedBy?.name || "Unknown"}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              Started {formatMeetingTime(meeting.startedAt)}
                              {meeting.endedAt ? ` - ended ${formatMeetingTime(meeting.endedAt)}` : ""}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {meeting.participantCount ?? meeting.participants?.length ?? 0} participants - {formatMeetingDuration(meeting)}
                            </p>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
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
                  <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {activities.length} events
                  </span>
                </div>

                <div className="mt-5">
                  <ActivityTimeline activities={activities} emptyTitle="No room activity yet" />
                </div>
              </section>
            )}
          </div>
        </main>
      </div>
    </section>
  );
};

export default RoomDetails;
