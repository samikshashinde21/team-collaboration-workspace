import { useEffect, useState } from "react";
import { DoorOpen, Lock, Plus, Trash2, Users, Video } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/api";
import { useAuth } from "../hooks/useAuth";

const roomsPerPage = 6;

const emptyRoomForm = {
  name: "",
  description: "",
  isOpenToEveryone: true,
  assignedUsers: [],
};

const roleBadgeClass = {
  admin: "bg-rose-100 text-rose-700",
  moderator: "bg-sky-100 text-sky-700",
  user: "bg-slate-100 text-slate-700",
};

const assignmentSections = [
  { role: "user", title: "Users", selectable: true },
  { role: "moderator", title: "Moderators", selectable: true },
  { role: "admin", title: "Admins", selectable: false },
];

const Rooms = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({ rooms: {}, meetings: {}, total: 0 });
  const [users, setUsers] = useState([]);
  const [formData, setFormData] = useState(emptyRoomForm);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [roomPendingDelete, setRoomPendingDelete] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

const canCreateRoom = user?.role === "admin";
  const canDeleteRoom = user?.role === "admin";
  const usersByRole = assignmentSections.reduce(
    (groups, section) => ({
      ...groups,
      [section.role]: users.filter((member) => member.role === section.role),
    }),
    {}
  );
  const totalPages = Math.max(Math.ceil(rooms.length / roomsPerPage), 1);
  const paginatedRooms = rooms.slice((currentPage - 1) * roomsPerPage, currentPage * roomsPerPage);

  const getMemberCount = (room) => {
    const memberIds = new Set();

    [...(room.members || []), room.createdBy].forEach((member) => {
      const memberId = member?._id || member?.id || member;
      if (memberId) memberIds.add(memberId.toString());
    });

    return memberIds.size;
  };

  useEffect(() => {
    let isMounted = true;

    const fetchRooms = async () => {
      setError("");

      try {
        const { data: roomsData } = await api.get("/rooms");

        if (isMounted) {
          setRooms(roomsData);
          setCurrentPage(1);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.response?.data?.message || "Could not load rooms.");
          setRooms([]);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }

      try {
        const { data: unreadData } = await api.get("/unread-counts");

        if (isMounted) {
          setUnreadCounts(unreadData);
        }
      } catch {
        if (isMounted) {
          setUnreadCounts({ rooms: {}, meetings: {}, total: 0 });
        }
      }
    };

    fetchRooms();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleUnreadUpdate = (event) => {
      setUnreadCounts(event.detail || { rooms: {}, meetings: {}, total: 0 });
    };

    const handleMeetingUpdate = (event) => {
      const { roomId, meeting } = event.detail || {};

      if (!roomId || !meeting) return;

      setRooms((currentRooms) =>
        currentRooms.map((room) =>
          room._id === roomId
            ? { ...room, activeMeeting: meeting.status === "active" ? meeting : null }
            : room
        )
      );
    };

    const handleMeetingDeleted = (event) => {
      const { roomId, meetingId } = event.detail || {};

      if (!roomId || !meetingId) return;

      setRooms((currentRooms) =>
        currentRooms.map((room) =>
          room._id === roomId && room.activeMeeting?.id === meetingId
            ? { ...room, activeMeeting: null }
            : room
        )
      );
    };

    window.addEventListener("unread-counts-updated", handleUnreadUpdate);
    window.addEventListener("room-meeting-updated", handleMeetingUpdate);
    window.addEventListener("room-meeting-deleted", handleMeetingDeleted);

    return () => {
      window.removeEventListener("unread-counts-updated", handleUnreadUpdate);
      window.removeEventListener("room-meeting-updated", handleMeetingUpdate);
      window.removeEventListener("room-meeting-deleted", handleMeetingDeleted);
    };
  }, []);

  useEffect(() => {
    const refreshRooms = async () => {
      try {
        const { data } = await api.get("/rooms");
        setRooms(data);
        setError("");
      } catch (err) {
        setError(err.response?.data?.message || "Could not load rooms.");
      }
    };

    window.addEventListener("room-invitation-accepted", refreshRooms);

    return () => {
      window.removeEventListener("room-invitation-accepted", refreshRooms);
    };
  }, []);

  useEffect(() => {
    if (!canCreateRoom) {
      return undefined;
    }

    let isMounted = true;

    const fetchUsers = async () => {
      try {
        const { data } = await api.get("/users");

        if (isMounted) {
          setUsers(data);
        }
      } catch {
        if (isMounted) {
          setUsers([]);
        }
      }
    };

    fetchUsers();

    return () => {
      isMounted = false;
    };
  }, [canCreateRoom]);

  const handleChange = (event) => {
    const { name, type, checked, value } = event.target;

    setFormData((currentFormData) => ({
      ...currentFormData,
      [name]: type === "checkbox" ? checked : value,
      ...(name === "isOpenToEveryone" && checked ? { assignedUsers: [] } : {}),
    }));
  };

  const handleAssignedUserChange = (userId) => {
    setFormData((currentFormData) => {
      const isSelected = currentFormData.assignedUsers.includes(userId);

      return {
        ...currentFormData,
        assignedUsers: isSelected
          ? currentFormData.assignedUsers.filter((assignedUserId) => assignedUserId !== userId)
          : [...currentFormData.assignedUsers, userId],
      };
    });
  };

  const handleCreateRoom = async (event) => {
    event.preventDefault();
    setError("");
    setIsCreating(true);

    try {
      const { data } = await api.post("/rooms", formData);
      setRooms([data, ...rooms]);
      setCurrentPage(1);
      setFormData(emptyRoomForm);
      setIsCreateOpen(false);
    } catch (err) {
      setError(err.response?.data?.message || "Could not create room.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteRoom = async (roomId) => {
    setError("");

    try {
      await api.delete(`/rooms/${roomId}`);
      const nextRooms = rooms.filter((room) => room._id !== roomId);
      setRooms(nextRooms);
      setCurrentPage((page) => Math.min(page, Math.max(Math.ceil(nextRooms.length / roomsPerPage), 1)));
    } catch (err) {
      setError(err.response?.data?.message || "Could not delete room.");
    }
  };

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setFormData(emptyRoomForm);
  };

  return (
    <section className="space-y-6">
      <div className="page-hero flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="section-kicker">Workspace</p>
          <h1 className="mt-2 text-4xl font-black text-navy-900">Rooms</h1>
          <p className="mt-2 text-slate-600">Browse rooms and join the space your team is using.</p>
        </div>

        {canCreateRoom && (
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" />
            Create room
          </button>
        )}
      </div>

      {!canCreateRoom && (
        <div className="soft-panel px-4 py-3 text-sm text-slate-600">
          You can view and join rooms you have access to. Admins can create new rooms.
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <p className="text-slate-600">Loading rooms...</p>
      ) : error ? (
        <div className="soft-panel border-dashed p-8 text-center text-slate-600">
          Rooms could not be shown right now.
        </div>
      ) : rooms.length === 0 ? (
        <div className="soft-panel border-dashed p-8 text-center text-slate-600">
          No rooms yet.
        </div>
      ) : (
        <>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {paginatedRooms.map((room) => {
            const isOpenRoom = room.isOpenToEveryone ?? !room.isPrivate;
            const unreadCount = unreadCounts.rooms?.[room._id] || 0;

            return (
              <article key={room._id} className="premium-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-3 icon-chip">
                      <Video className="h-5 w-5" />
                    </div>
                    <h2 className="text-lg font-black text-navy-900">{room.name}</h2>
                    <p className="mt-2 text-sm text-slate-600">{room.description || "No description"}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {room.activeMeeting && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-700 ring-4 ring-emerald-300/20">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                        LIVE
                      </span>
                    )}
                    {unreadCount > 0 && (
                      <span className="animate-pulseSoft rounded-full bg-mint-500 px-2 py-0.5 text-xs font-black text-navy-950">
                        {unreadCount} unread
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                        isOpenRoom ? "bg-mint-300/40 text-emerald-800" : "bg-lavender-200/60 text-navy-900"
                      }`}
                    >
                      {isOpenRoom ? <DoorOpen className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                      {isOpenRoom ? "Open Room" : "Restricted Room"}
                    </span>
                  </div>
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-slate-500">Created by</dt>
                    <dd className="mt-1 font-medium text-slate-900">{room.createdBy?.name || "Unknown"}</dd>
                  </div>
                  <div>
                    <dt className="inline-flex items-center gap-1 text-slate-500">
                      <Users className="h-3.5 w-3.5" />
                      Members
                    </dt>
                    <dd className="mt-1 font-medium text-slate-900">{getMemberCount(room)}</dd>
                  </div>
                </dl>

                {room.activeMeeting && (
                  <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-800">
                    <p className="truncate font-black">Live now: {room.activeMeeting.title}</p>
                    <p className="mt-1 text-xs">
                      {room.activeMeeting.activeParticipantCount ?? room.activeMeeting.participantCount ?? 0} participants connected
                    </p>
                  </div>
                )}

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/rooms/${room._id}?tab=chat`)}
                    className="btn-primary px-3"
                  >
                    <DoorOpen className="h-4 w-4" />
                    Join room
                  </button>
                  <Link
                    to={`/rooms/${room._id}?tab=activity`}
                    className="btn-secondary px-3"
                  >
                    View details
                  </Link>
                  {canDeleteRoom && (
                    <button
                      type="button"
                      onClick={() => setRoomPendingDelete(room)}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white/70 px-3 py-2 text-sm font-semibold text-red-700 transition hover:-translate-y-0.5 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-white/70 bg-white/65 px-4 py-3 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-slate-600">
            Showing {(currentPage - 1) * roomsPerPage + 1}-{Math.min(currentPage * roomsPerPage, rooms.length)} of {rooms.length} rooms
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
              disabled={currentPage === 1}
              className="btn-secondary px-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="status-pill">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="btn-secondary px-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
        </>
      )}

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/55 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/70 bg-white/90 p-6 shadow-lift backdrop-blur-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Create room</h2>
                <p className="mt-1 text-sm text-slate-600">Set up a room for collaboration.</p>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                className="btn-secondary px-3 py-1.5"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-700">
                  Room name
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="field-input"
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-slate-700">
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows="4"
                  className="field-input"
                />
              </div>

              <label className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input
                  name="isOpenToEveryone"
                  type="checkbox"
                  checked={formData.isOpenToEveryone}
                  onChange={handleChange}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Open room for everyone
              </label>

              {!formData.isOpenToEveryone && (
                <div className="max-h-96 overflow-y-auto rounded-md border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Assign Users</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Selected users can join this room. Admins always have access; moderators need to be assigned.
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                      {formData.assignedUsers.length} selected
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {assignmentSections.map((section) => {
                      const sectionUsers = usersByRole[section.role] || [];
                      const selectedCount = sectionUsers.filter((member) =>
                        formData.assignedUsers.includes(member._id)
                      ).length;

                      return (
                        <details key={section.role} className="group rounded-md border border-slate-200 bg-white">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="text-sm text-slate-500 transition-transform group-open:rotate-90">
                                ▸
                              </span>
                              <span className="truncate text-sm font-medium text-slate-800">{section.title}</span>
                            </span>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                                section.selectable ? "bg-slate-100 text-slate-700" : roleBadgeClass.admin
                              }`}
                            >
                              {section.selectable ? `${selectedCount}/${sectionUsers.length}` : "Always access"}
                            </span>
                          </summary>

                          <div className="max-h-44 space-y-2 overflow-y-scroll border-t border-slate-100 p-3">
                            {sectionUsers.length ? (
                              sectionUsers.map((member) => {
                                const isSelected =
                                  !section.selectable || formData.assignedUsers.includes(member._id);

                                return (
                                  <label
                                    key={member._id}
                                    className={`flex items-center gap-3 rounded-md border px-3 py-2 ${
                                      isSelected
                                        ? "border-slate-900 bg-slate-50"
                                        : "border-slate-200 hover:bg-slate-50"
                                    } ${section.selectable ? "cursor-pointer" : "cursor-default opacity-80"}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      disabled={!section.selectable}
                                      onChange={() => handleAssignedUserChange(member._id)}
                                      className="h-4 w-4 rounded border-slate-300"
                                    />
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
                                  </label>
                                );
                              })
                            ) : (
                              <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                                No {section.title.toLowerCase()} found.
                              </p>
                            )}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isCreating}
                className="btn-primary w-full"
              >
                <Plus className="h-4 w-4" />
                {isCreating ? "Creating..." : "Create room"}
              </button>
            </form>
          </div>
        </div>
      )}

      {roomPendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/55 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/70 bg-white/90 p-6 shadow-lift backdrop-blur-2xl">
            <h2 className="text-lg font-semibold text-slate-900">Delete room?</h2>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to delete {roomPendingDelete.name}? This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRoomPendingDelete(null)}
                className="btn-secondary px-3"
              >
                No
              </button>
              <button
                type="button"
                onClick={() => {
                  handleDeleteRoom(roomPendingDelete._id);
                  setRoomPendingDelete(null);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-red-700"
              >
                <Trash2 className="h-4 w-4" />
                Yes, delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default Rooms;
