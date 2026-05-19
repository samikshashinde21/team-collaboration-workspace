import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/api";

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
    { label: "Total Users", value: stats?.totalUsers ?? 0 },
    { label: "Active Rooms", value: stats?.totalRooms ?? 0 },
    { label: "Online Users", value: stats?.onlineUsersCount ?? 0 },
    { label: "Active Calls", value: stats?.activeCallsCount ?? 0 },
  ];

  return (
    <section>
      <div className="mb-6">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Admin</p>
        <h1 className="mt-2 text-3xl font-semibold">Admin dashboard</h1>
        <p className="mt-2 text-slate-600">Admin-only area for platform controls.</p>
      </div>

      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{card.label}</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">
              {isLoading ? "..." : card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">Recent activity</h2>
            <p className="mt-1 text-sm text-slate-500">Latest platform changes</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
            Latest 5
          </span>
        </div>

        <div className="mt-4 divide-y divide-slate-100">
          {isLoading ? (
            <p className="py-4 text-sm text-slate-600">Loading activity...</p>
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
                  {activity.user?.name || "System"} · {activity.action.replaceAll("_", " ")}
                </p>
              </div>
            ))
          ) : (
            <p className="py-4 text-sm text-slate-600">No recent activity yet.</p>
          )}
        </div>
      </div>

      <Link
        to="/admin/users"
        className="mt-6 block rounded-lg border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-400"
      >
        <h2 className="font-semibold">Manage users</h2>
        <p className="mt-2 text-sm text-slate-600">View users and update roles.</p>
      </Link>
    </section>
  );
};

export default AdminDashboard;
