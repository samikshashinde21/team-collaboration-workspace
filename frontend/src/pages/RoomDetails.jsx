import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../api/api";
import ChatBox from "../components/ChatBox";
import VideoCall from "../components/VideoCall";
import { useAuth } from "../hooks/useAuth";

const roleBadgeClass = {
  admin: "bg-rose-100 text-rose-700",
  moderator: "bg-sky-100 text-sky-700",
  user: "bg-slate-100 text-slate-700",
};

const RoomDetails = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [room, setRoom] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteDescription, setInviteDescription] = useState("");
  const [roomInvitations, setRoomInvitations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [invitingUserId, setInvitingUserId] = useState("");

  const canInvite = user?.role === "admin" || user?.role === "moderator";

  useEffect(() => {
    let isMounted = true;

    const fetchRoom = async () => {
      try {
        const { data } = await api.get(`/rooms/${id}`);

        if (isMounted) {
          setRoom(data);
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

  return (
    <section>
      <Link to="/rooms" className="text-sm font-medium text-slate-600 underline">
        Back to rooms
      </Link>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Room</p>
            <h1 className="mt-2 text-3xl font-semibold">{room.name}</h1>
            <p className="mt-3 max-w-2xl text-slate-600">{room.description || "No description"}</p>
          </div>
          <div className="flex w-fit flex-wrap gap-2">
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
                      <p className="min-w-0 truncate text-sm font-medium">{member.name}</p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                          isOnline
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {isOnline ? "Online" : "Offline"}
                      </span>
                    </div>
                    <p className="text-xs capitalize text-slate-500">{member.role}</p>
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

        <div className="grid gap-4">
          <ChatBox
            roomId={room._id}
            onOnlineUsersChange={handleOnlineUsersChange}
            onParticipantsChange={handleParticipantsChange}
          />

          <VideoCall roomId={room._id} />
        </div>
      </div>
    </section>
  );
};

export default RoomDetails;
