import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  PieChart as PieChartIcon,
  Radio,
  Shield,
  Sparkles,
  Users,
  Video,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { io } from "socket.io-client";
import api from "../api/api";
import ActivityTimeline from "../components/ActivityTimeline";
import { useAuth } from "../hooks/useAuth";

const chartColors = ["#8B7CFF", "#3BC98E", "#38BDF8", "#F59E0B", "#F43F5E"];
const emptyDistribution = [{ name: "No activity", value: 1 }];

const Dashboard = () => {
  const { user, token } = useAuth();
  const [activities, setActivities] = useState([]);
  const [adminStats, setAdminStats] = useState(null);
  const [adminError, setAdminError] = useState("");
  const [isAdminStatsLoading, setIsAdminStatsLoading] = useState(user?.role === "admin");

  useEffect(() => {
    let isMounted = true;

    const fetchActivity = async () => {
      try {
        const { data } = await api.get("/activity", {
          params: { recent: true, limit: user?.role === "admin" ? 5 : 8 },
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
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== "admin") {
      return undefined;
    }

    let isMounted = true;

    const fetchAdminStats = async () => {
      setIsAdminStatsLoading(true);

      try {
        const { data } = await api.get("/dashboard/stats");

        if (isMounted) {
          setAdminStats(data);
        }
      } catch (err) {
        if (isMounted) {
          setAdminError(err.response?.data?.message || "Could not load dashboard stats.");
        }
      } finally {
        if (isMounted) {
          setIsAdminStatsLoading(false);
        }
      }
    };

    fetchAdminStats();

    return () => {
      isMounted = false;
    };
  }, [user?.role]);

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
      ].slice(0, user?.role === "admin" ? 5 : 8));
    });

    return () => {
      socket.disconnect();
    };
  }, [token, user?.role]);

  const analytics = adminStats?.analytics || {};
  const recentAdminActivity = useMemo(
    () => (activities.length ? activities : adminStats?.recentActivity || []).slice(0, 5),
    [activities, adminStats]
  );

  const adminStatCards = [
    {
      label: "Total users",
      value: adminStats?.totalUsers ?? 0,
      icon: Users,
      accent: "from-lavender-500/20 to-mint-300/30",
      helper: "Registered workspace accounts",
    },
    {
      label: "Active rooms",
      value: adminStats?.activeRooms ?? adminStats?.totalRooms ?? 0,
      icon: Video,
      accent: "from-sky-300/25 to-lavender-200/40",
      helper: "Rooms available to teams",
    },
    {
      label: "Active meetings",
      value: adminStats?.activeMeetings ?? adminStats?.activeCallsCount ?? 0,
      icon: Radio,
      accent: "from-mint-300/35 to-emerald-200/35",
      helper: "Live sessions right now",
    },
    {
      label: "Online users",
      value: adminStats?.onlineUsersCount ?? 0,
      icon: Activity,
      accent: "from-rose-200/35 to-amber-200/35",
      helper: "Connected via realtime presence",
    },
  ];

  const roomActivityData = analytics.roomActivityDistribution?.length
    ? analytics.roomActivityDistribution
    : emptyDistribution;
  const roleDistributionData = analytics.userRoleDistribution?.length
    ? analytics.userRoleDistribution
    : emptyDistribution;
  const weeklyActivityData = analytics.weeklyWorkspaceActivity?.length
    ? analytics.weeklyWorkspaceActivity
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => ({ day, count: 0 }));

  if (user?.role === "admin") {
    return (
      <section className="relative space-y-8">
        <div className="pointer-events-none absolute -right-8 top-10 hidden h-40 w-40 rotate-12 rounded-[2rem] border border-white/50 bg-white/25 shadow-glow backdrop-blur-2xl md:block" />
        <div className="pointer-events-none absolute -left-8 top-80 hidden h-32 w-52 -rotate-6 rounded-[2rem] border border-white/50 bg-mint-300/15 shadow-soft backdrop-blur-2xl lg:block" />

        <div className="page-hero">
          <div className="absolute right-8 top-8 hidden h-28 w-44 rotate-6 rounded-[2rem] border border-white/50 bg-white/35 shadow-glow backdrop-blur-2xl md:block" />
          <div className="max-w-3xl">
            <p className="section-kicker">Workspace Overview</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-navy-900 md:text-5xl">
              Workspace analytics
            </h1>
            <p className="mt-3 max-w-2xl text-slate-600">
              A focused view of platform health, live collaboration, and the latest operational movement.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <span className="status-pill">
              <Shield className="h-3.5 w-3.5 text-lavender-500" />
              Admin dashboard
            </span>
            <span className="status-pill">
              <BarChart3 className="h-3.5 w-3.5 text-mint-500" />
              {recentAdminActivity.length} latest events
            </span>
          </div>
        </div>

        {adminError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {adminError}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {adminStatCards.map((card) => {
            const Icon = card.icon;

            return (
              <article key={card.label} className="premium-card group relative overflow-hidden p-5">
                <div className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-br ${card.accent}`} />
                <div className="relative">
                  <div className="mb-5 flex items-center justify-between">
                    <span className="icon-chip">
                      <Icon className="h-5 w-5" />
                    </span>
                    <ArrowUpRight className="h-5 w-5 text-lavender-500 transition group-hover:translate-x-1 group-hover:-translate-y-1" />
                  </div>
                  <p className="text-sm font-semibold text-slate-500">{card.label}</p>
                  <p className="mt-2 text-4xl font-black text-navy-900">
                    {isAdminStatsLoading ? "..." : card.value}
                  </p>
                  <p className="mt-3 text-xs font-medium text-slate-500">{card.helper}</p>
                </div>
              </article>
            );
          })}
        </div>

        <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="soft-panel p-5">
            <div className="mb-5">
              <h2 className="inline-flex items-center gap-2 text-xl font-black text-navy-900">
                <BarChart3 className="h-5 w-5 text-lavender-500" />
                Weekly workspace activity
              </h2>
              <p className="mt-1 text-sm text-slate-500">Events captured across the last 7 days.</p>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyActivityData} margin={{ left: -20, right: 8, top: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="activityGradient" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#8B7CFF" stopOpacity={0.38} />
                      <stop offset="95%" stopColor="#8B7CFF" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#E8E3F6" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#64748B", fontSize: 12 }} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#64748B", fontSize: 12 }} />
                  <Tooltip contentStyle={{ border: "0", borderRadius: "12px", boxShadow: "0 18px 45px rgba(30, 27, 75, 0.12)" }} />
                  <Area type="monotone" dataKey="count" stroke="#8B7CFF" strokeWidth={3} fill="url(#activityGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="soft-panel p-5">
            <div className="mb-5">
              <h2 className="inline-flex items-center gap-2 text-xl font-black text-navy-900">
                <PieChartIcon className="h-5 w-5 text-mint-500" />
                User roles
              </h2>
              <p className="mt-1 text-sm text-slate-500">Role mix across workspace accounts.</p>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={roleDistributionData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={62}
                    outerRadius={92}
                    paddingAngle={4}
                  >
                    {roleDistributionData.map((entry, index) => (
                      <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ border: "0", borderRadius: "12px", boxShadow: "0 18px 45px rgba(30, 27, 75, 0.12)" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
              {roleDistributionData.map((item, index) => (
                <div key={item.name} className="flex items-center justify-between rounded-xl bg-white/60 px-3 py-2 text-sm">
                  <span className="inline-flex items-center gap-2 font-semibold text-slate-600">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
                    {item.name}
                  </span>
                  <span className="font-black text-navy-900">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="soft-panel p-5">
            <div className="mb-5">
              <h2 className="inline-flex items-center gap-2 text-xl font-black text-navy-900">
                <Video className="h-5 w-5 text-lavender-500" />
                Room activity distribution
              </h2>
              <p className="mt-1 text-sm text-slate-500">How room and meeting actions are trending.</p>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roomActivityData} layout="vertical" margin={{ left: 8, right: 12, top: 4, bottom: 4 }}>
                  <CartesianGrid stroke="#E8E3F6" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#64748B", fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={112} axisLine={false} tickLine={false} tick={{ fill: "#334155", fontSize: 12 }} />
                  <Tooltip contentStyle={{ border: "0", borderRadius: "12px", boxShadow: "0 18px 45px rgba(30, 27, 75, 0.12)" }} />
                  <Bar dataKey="value" radius={[0, 10, 10, 0]} fill="#3BC98E" barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="soft-panel p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="inline-flex items-center gap-2 text-xl font-black text-navy-900">
                  <Activity className="h-5 w-5 text-mint-500" />
                  Recent activity
                </h2>
                <p className="mt-1 text-sm text-slate-500">Compact view of the latest platform changes.</p>
              </div>
              <Link to="/activity" className="btn-secondary w-fit">
                View All Activity
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>

            {isAdminStatsLoading ? (
              <p className="rounded-xl bg-white/60 px-4 py-5 text-sm text-slate-600">Loading activity...</p>
            ) : (
              <ActivityTimeline activities={recentAdminActivity} emptyTitle="No recent activity" compact />
            )}
          </div>
        </section>
      </section>
    );
  }

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
          <span className="status-pill">{activities.length} shown</span>
        </div>
        <ActivityTimeline activities={activities} emptyTitle="No recent activity" compact />
      </section>
    </section>
  );
};

export default Dashboard;
