import { useEffect, useState } from "react";
import { Activity, PhoneCall, Shield, Users, Video } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../api/api";
import Loader from "../components/Loader";

const formatActivityTime = (value) => {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchStats = async () => {
      try {
        const { data } = await api.get("/dashboard/stats");

        if (isMounted) {
          setStats(data);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.response?.data?.message || "Could not load dashboard stats.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchStats();

    return () => {
      isMounted = false;
    };
  }, []);

  const statCards = [
    { label: "Total Users", value: stats?.totalUsers ?? 0, icon: Users },
    { label: "Active Rooms", value: stats?.totalRooms ?? 0, icon: Video },
    { label: "Online Users", value: stats?.onlineUsersCount ?? 0, icon: Activity },
    { label: "Active Calls", value: stats?.activeCallsCount ?? 0, icon: PhoneCall },
  ];

  return (
    <section className="space-y-6">
      <div className="page-hero">
        <p className="section-kicker">Admin</p>
        <h1 className="mt-2 text-4xl font-black text-navy-900">Admin dashboard</h1>
        <p className="mt-2 text-slate-600">Admin-only area for platform controls.</p>
      </div>

      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;

          return (
            <div key={card.label} className="premium-card p-5">
              <span className="icon-chip mb-4">
                <Icon className="h-5 w-5" />
              </span>
              <p className="text-sm font-semibold text-slate-500">{card.label}</p>
              <div className="mt-3 min-h-9 text-3xl font-black text-navy-900">
                {isLoading ? <Loader label={`Loading ${card.label}`} className="justify-start py-1" /> : card.value}
              </div>
            </div>
          );
        })}
      </div>

      <div className="soft-panel p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="inline-flex items-center gap-2 font-black text-navy-900">
              <Activity className="h-4 w-4" />
              Recent activity
            </h2>
            <p className="mt-1 text-sm text-slate-500">Latest platform changes</p>
          </div>
          <span className="status-pill">Latest 5</span>
        </div>

        <div className="mt-4 divide-y divide-slate-100">
          {isLoading ? (
            <Loader label="Loading activity" className="py-4" />
          ) : stats?.recentActivity?.length ? (
            stats.recentActivity.map((activity) => (
              <div key={activity.id} className="py-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-medium text-slate-900">{activity.description || activity.action}</p>
                  <time className="text-sm text-slate-500" dateTime={activity.timestamp}>
                    {formatActivityTime(activity.timestamp)}
                  </time>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {activity.actor?.name || "System"} - {activity.action.replaceAll("_", " ")}
                </p>
              </div>
            ))
          ) : (
            <p className="py-4 text-sm text-slate-600">No recent activity yet.</p>
          )}
        </div>
      </div>

      <Link to="/admin/users" className="premium-card block p-5">
        <h2 className="inline-flex items-center gap-2 font-black text-navy-900">
          <Shield className="h-4 w-4" />
          Manage users
        </h2>
        <p className="mt-2 text-sm text-slate-600">View users and update roles.</p>
      </Link>
    </section>
  );
};

export default AdminDashboard;
