import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../api/api";
import ChatBox from "../components/ChatBox";

const RoomDetails = () => {
  const { id } = useParams();
  const [room, setRoom] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

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
          <span
            className={`w-fit rounded-full px-3 py-1 text-sm font-medium ${
              room.isLocked ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
            }`}
          >
            {room.isLocked ? "Locked" : "Unlocked"}
          </span>
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

      <div className="mt-6 grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Participants</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
              {onlineUsers.length} online
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {room.members?.length ? (
              room.members.map((member) => {
                const memberId = member._id || member.id;
                const isOnline = onlineUsers.some((onlineUser) => onlineUser.id === memberId);

                return (
                  <div key={memberId} className="rounded-md bg-slate-50 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{member.name}</p>
                      {isOnline && (
                        <span className="h-2 w-2 rounded-full bg-emerald-500" aria-label="Online" />
                      )}
                    </div>
                    <p className="text-xs capitalize text-slate-500">{member.role}</p>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-slate-600">Participants will appear here.</p>
            )}
          </div>
        </aside>

        <div className="grid gap-4">
          <ChatBox
            roomId={room._id}
            onOnlineUsersChange={handleOnlineUsersChange}
            onParticipantsChange={handleParticipantsChange}
          />

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">Video call</h2>
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-600">
              Video call controls will appear here after WebRTC is added.
            </div>
          </section>
        </div>
      </div>
    </section>
  );
};

export default RoomDetails;
