import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/api";
import { useAuth } from "../hooks/useAuth";

const roleOptions = ["admin", "moderator", "user"];
const emptyRoomForm = {
  name: "",
  description: "",
  isPrivate: false,
  locked: false,
  allowedRoles: [],
  allowedUsers: [],
};

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

  const canCreateRoom = user?.role === "admin";
  const canDeleteRoom = user?.role === "admin";

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
      ...(name === "isPrivate" && !checked ? { allowedRoles: [], allowedUsers: [] } : {}),
    }));
  };

  const handleAllowedRoleChange = (event) => {
    const { value, checked } = event.target;

    setFormData((currentFormData) => ({
      ...currentFormData,
      allowedRoles: checked
        ? [...currentFormData.allowedRoles, value]
        : currentFormData.allowedRoles.filter((role) => role !== value),
    }));
  };

  const handleAllowedUsersChange = (event) => {
    setFormData((currentFormData) => ({
      ...currentFormData,
      allowedUsers: Array.from(event.target.selectedOptions, (option) => option.value),
    }));
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
            const isRoomLocked = Boolean(room.locked ?? room.isLocked);

            return (
            <article key={room._id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">{room.name}</h2>
                  <p className="mt-2 text-sm text-slate-600">{room.description || "No description"}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {room.isPrivate && (
                    <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-800">
                      Private
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      isRoomLocked
                        ? "bg-amber-100 text-amber-800"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {isRoomLocked ? "Locked" : "Unlocked"}
                  </span>
                </div>
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
                    onClick={() => handleDeleteRoom(room._id)}
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

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
                  <input
                    name="isPrivate"
                    type="checkbox"
                    checked={formData.isPrivate}
                    onChange={handleChange}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Private room
                </label>

                <label className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
                  <input
                    name="locked"
                    type="checkbox"
                    checked={formData.locked}
                    onChange={handleChange}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Locked room
                </label>
              </div>

              {formData.isPrivate && (
                <div className="space-y-4 rounded-md border border-slate-200 p-4">
                  <div>
                    <p className="text-sm font-medium text-slate-700">Allowed roles</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {roleOptions.map((role) => (
                        <label
                          key={role}
                          className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm capitalize text-slate-700"
                        >
                          <input
                            type="checkbox"
                            value={role}
                            checked={formData.allowedRoles.includes(role)}
                            onChange={handleAllowedRoleChange}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          {role}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="allowedUsers" className="block text-sm font-medium text-slate-700">
                      Assigned users
                    </label>
                    <select
                      id="allowedUsers"
                      multiple
                      value={formData.allowedUsers}
                      onChange={handleAllowedUsersChange}
                      className="mt-1 h-28 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
                    >
                      {users.map((member) => (
                        <option key={member._id} value={member._id}>
                          {member.name} ({member.email})
                        </option>
                      ))}
                    </select>
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
    </section>
  );
};

export default Rooms;
