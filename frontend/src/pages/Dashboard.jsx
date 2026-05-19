import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { io } from "socket.io-client";
import api from "../api/api";
import ActivityTimeline from "../components/ActivityTimeline";
import { useAuth } from "../hooks/useAuth";

const Dashboard = () => {
  const { user, token } = useAuth();
  const [activities, setActivities] = useState([]);

  useEffect(() => {
    let isMounted = true;

    const fetchActivity = async () => {
      try {
        const { data } = await api.get("/activity", {
          params: { recent: true, limit: 8 },
        });

        if (isMounted) {
          setActivities(data);
        }
      } catch {
        if (isMounted) {
          setActivities([]);
        }
      }
    };

    fetchActivity();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!token) return undefined;

    const socket = io("http://localhost:5000", { auth: { token } });

    socket.on("connect", () => {
      socket.emit("subscribe-activity");
    });

    socket.on("activity-created", (activity) => {
      setActivities((currentActivities) => [
        activity,
        ...currentActivities.filter((item) => item.id !== activity.id),
      ].slice(0, 8));
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);

  return (
    <section>
      <div className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold">Hello, {user?.name}</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Your collaboration workspace foundation is ready. Rooms, members, and admin tools are
          separated so realtime features can plug in cleanly later.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link to="/rooms" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Rooms</h2>
          <p className="mt-2 text-sm text-slate-600">Create and browse collaboration rooms.</p>
        </Link>

        {user?.role === "admin" && (
          <>
            <Link
              to="/admin/dashboard"
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h2 className="font-semibold">Admin dashboard</h2>
              <p className="mt-2 text-sm text-slate-600">Review admin-only controls.</p>
            </Link>
            <Link
              to="/admin/users"
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h2 className="font-semibold">Users</h2>
              <p className="mt-2 text-sm text-slate-600">Manage account roles.</p>
            </Link>
          </>
        )}
      </div>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Recent activity</h2>
            <p className="mt-1 text-sm text-slate-500">Latest workspace events you can access.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            {activities.length} shown
          </span>
        </div>
        <ActivityTimeline activities={activities} emptyTitle="No recent activity" compact />
      </section>
    </section>
  );
};

export default Dashboard;
