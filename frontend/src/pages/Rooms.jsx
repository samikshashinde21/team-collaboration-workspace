import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/api";
import { useAuth } from "../hooks/useAuth";

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
  const [users, setUsers] = useState([]);
  const [formData, setFormData] = useState(emptyRoomForm);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [roomPendingDelete, setRoomPendingDelete] = useState(null);

  const canCreateRoom = user?.role === "admin";
  const canDeleteRoom = user?.role === "admin";
  const usersByRole = assignmentSections.reduce(
    (groups, section) => ({
      ...groups,
      [section.role]: users.filter((member) => member.role === section.role),
    }),
    {}
  );

  useEffect(() => {
    let isMounted = true;

    const fetchRooms = async () => {
      try {
        const { data } = await api.get("/rooms");

        if (isMounted) {
          setRooms(data);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.response?.data?.message || "Could not load rooms.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchRooms();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const refreshRooms = async () => {
      try {
        const { data } = await api.get("/rooms");
        setRooms(data);
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
      setRooms(rooms.filter((room) => room._id !== roomId));
    } catch (err) {
      setError(err.response?.data?.message || "Could not delete room.");
    }
  };

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setFormData(emptyRoomForm);
  };

  return (
    <section>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Workspace</p>
          <h1 className="mt-2 text-3xl font-semibold">Rooms</h1>
          <p className="mt-2 text-slate-600">Browse rooms and join the space your team is using.</p>
        </div>

        {canCreateRoom && (
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Create room
          </button>
        )}
      </div>

      {!canCreateRoom && (
        <div className="mb-5 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
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
      ) : rooms.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
          No rooms yet.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rooms.map((room) => {
            const isOpenRoom = room.isOpenToEveryone ?? !room.isPrivate;

            return (
              <article key={room._id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold">{room.name}</h2>
                    <p className="mt-2 text-sm text-slate-600">{room.description || "No description"}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      isOpenRoom ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {isOpenRoom ? "Open Room" : "Restricted Room"}
                  </span>
                </div>

                <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-slate-500">Created by</dt>
                    <dd className="mt-1 font-medium text-slate-900">{room.createdBy?.name || "Unknown"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Members</dt>
                    <dd className="mt-1 font-medium text-slate-900">{room.members?.length || 0}</dd>
                  </div>
                </dl>

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/rooms/${room._id}`)}
                    className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    Join room
                  </button>
                  <Link
                    to={`/rooms/${room._id}`}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    View details
                  </Link>
                  {canDeleteRoom && (
                    <button
                      type="button"
                      onClick={() => setRoomPendingDelete(room)}
                      className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Create room</h2>
                <p className="mt-1 text-sm text-slate-600">Set up a room for collaboration.</p>
              </div>
              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
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
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
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
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
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
                        Selected users can join this room. Admins and moderators always have access.
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
                className="w-full rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isCreating ? "Creating..." : "Create room"}
              </button>
            </form>
          </div>
        </div>
      )}

      {roomPendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Delete room?</h2>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to delete {roomPendingDelete.name}? This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRoomPendingDelete(null)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                No
              </button>
              <button
                type="button"
                onClick={() => {
                  handleDeleteRoom(roomPendingDelete._id);
                  setRoomPendingDelete(null);
                }}
                className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
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
