import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/api";

const Rooms = () => {
  const [rooms, setRooms] = useState([]);
  const [formData, setFormData] = useState({ name: "", description: "" });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

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

  const handleChange = (event) => {
    setFormData({
      ...formData,
      [event.target.name]: event.target.value,
    });
  };

  const handleCreateRoom = async (event) => {
    event.preventDefault();
    setError("");
    setIsCreating(true);

    try {
      const { data } = await api.post("/rooms", formData);
      setRooms([data, ...rooms]);
      setFormData({ name: "", description: "" });
    } catch (err) {
      setError(err.response?.data?.message || "Could not create room.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <section className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Create room</h1>
        <form onSubmit={handleCreateRoom} className="mt-5 space-y-4">
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

          <button
            type="submit"
            disabled={isCreating}
            className="w-full rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isCreating ? "Creating..." : "Create room"}
          </button>
        </form>
      </div>

      <div>
        <div className="mb-4">
          <h1 className="text-2xl font-semibold">Rooms</h1>
          <p className="mt-1 text-sm text-slate-600">Open a room to view its foundation page.</p>
        </div>

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
          <div className="grid gap-4">
            {rooms.map((room) => (
              <Link
                key={room._id}
                to={`/rooms/${room._id}`}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-400"
              >
                <h2 className="font-semibold">{room.name}</h2>
                <p className="mt-2 text-sm text-slate-600">{room.description || "No description"}</p>
                <p className="mt-4 text-xs text-slate-500">
                  Created by {room.createdBy?.name || "Unknown"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default Rooms;
