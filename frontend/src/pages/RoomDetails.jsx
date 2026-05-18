import { Link, useParams } from "react-router-dom";

const RoomDetails = () => {
  const { id } = useParams();

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <Link to="/rooms" className="text-sm font-medium text-slate-600 underline">
        Back to rooms
      </Link>
      <div className="mt-6">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Room details</p>
        <h1 className="mt-2 text-2xl font-semibold">Room {id}</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          This page is ready for room information, chat, Socket.IO events, and WebRTC features in
          later steps.
        </p>
      </div>
    </section>
  );
};

export default RoomDetails;
