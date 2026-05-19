import { useEffect, useState } from "react";
import { Activity, BarChart3, Shield, Sparkles, Users, Video } from "lucide-react";
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
    <section className="space-y-8">
      <div className="page-hero">
        <div className="absolute right-8 top-8 hidden h-24 w-36 rotate-6 rounded-[2rem] bg-mint-300/30 blur-xl md:block" />
        <div className="max-w-3xl">
          <p className="section-kicker">Dashboard</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-navy-900 md:text-5xl">
            Hello, {user?.name}
          </h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Your team workspace is live, layered, and ready for rooms, meetings, messages, and activity.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <span className="status-pill">
            <Sparkles className="h-3.5 w-3.5 text-mint-500" />
            Realtime workspace
          </span>
          <span className="status-pill">
            <Activity className="h-3.5 w-3.5 text-lavender-500" />
            {activities.length} recent events
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link to="/rooms" className="premium-card group p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="icon-chip">
              <Video className="h-5 w-5" />
            </span>
            <BarChart3 className="h-5 w-5 text-lavender-500 transition group-hover:translate-x-1" />
          </div>
          <h2 className="font-bold text-navy-900">Rooms</h2>
          <p className="mt-2 text-sm text-slate-600">Create and browse collaboration rooms.</p>
        </Link>

        {user?.role === "admin" && (
          <>
            <Link
              to="/admin/dashboard"
              className="premium-card group p-5"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="icon-chip">
                  <Shield className="h-5 w-5" />
                </span>
                <BarChart3 className="h-5 w-5 text-lavender-500 transition group-hover:translate-x-1" />
              </div>
              <h2 className="font-bold text-navy-900">Admin dashboard</h2>
              <p className="mt-2 text-sm text-slate-600">Review admin-only controls.</p>
            </Link>
            <Link
              to="/admin/users"
              className="premium-card group p-5"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="icon-chip">
                  <Users className="h-5 w-5" />
                </span>
                <BarChart3 className="h-5 w-5 text-lavender-500 transition group-hover:translate-x-1" />
              </div>
              <h2 className="font-bold text-navy-900">Users</h2>
              <p className="mt-2 text-sm text-slate-600">Manage account roles.</p>
            </Link>
          </>
        )}
      </div>

      <section className="soft-panel p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="icon-chip h-9 w-9">
                <Activity className="h-4 w-4" />
              </span>
              <h2 className="text-xl font-black text-navy-900">Recent activity</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">Latest workspace events you can access.</p>
          </div>
          <span className="status-pill">
            {activities.length} shown
          </span>
        </div>
        <ActivityTimeline activities={activities} emptyTitle="No recent activity" compact />
      </section>
    </section>
  );
};

export default Dashboard;
