import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  MailQuestion,
  PieChart as PieChartIcon,
  Radio,
  Shield,
  Sparkles,
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
const timeframeOptions = ["7D", "30D", "90D"];
const statRefreshActions = new Set([
  "ROOM_CREATED",
  "ROOM_DELETED",
  "MEETING_STARTED",
  "MEETING_ENDED",
  "INVITATION_SENT",
  "INVITATION_ACCEPTED",
  "INVITATION_REJECTED",
  "ROOM_JOINED",
  "ROOM_LEFT",
  "USER_KICKED",
  "SCREEN_SHARE_BLOCKED",
  "SCREEN_SHARE_ALLOWED",
  "USER_ROLE_UPDATED",
]);

const RoomActivityTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) {
    return null;
  }

  const item = payload[0]?.payload;

  return (
    <div className="rounded-2xl border border-white/70 bg-white/95 px-4 py-3 text-sm shadow-lift backdrop-blur-xl">
      <p className="font-black text-navy-900">{item.name}</p>
      <p className="mt-1 text-slate-600">{item.value}</p>
      {item.details?.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-slate-100 pt-2">
          {item.details.map((detail) => (
            <div key={detail.name} className="flex items-center justify-between gap-6 text-xs text-slate-500">
              <span>{detail.name}</span>
              <span className="font-bold text-navy-900">{detail.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Dashboard = () => {
  const { user, token } = useAuth();
  const [activities, setActivities] = useState([]);
  const [adminStats, setAdminStats] = useState(null);
  const [adminError, setAdminError] = useState("");
  const [isAdminStatsLoading, setIsAdminStatsLoading] = useState(user?.role === "admin");
  const [activityTimeframe, setActivityTimeframe] = useState("7D");

  const fetchAdminStats = useCallback(async ({ showLoading = false } = {}) => {
    if (user?.role !== "admin") {
      return;
    }

    if (showLoading) {
      setIsAdminStatsLoading(true);
    }

    try {
      const { data } = await api.get("/dashboard/stats", {
        params: { timeframe: activityTimeframe.replace("D", "") },
      });

      setAdminStats(data);
      setAdminError("");
    } catch (err) {
      setAdminError(err.response?.data?.message || "Could not load dashboard stats.");
    } finally {
      if (showLoading) {
        setIsAdminStatsLoading(false);
      }
    }
  }, [activityTimeframe, user?.role]);

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

    fetchAdminStats({ showLoading: true });
  }, [fetchAdminStats, user?.role]);

  useEffect(() => {
    if (user?.role !== "admin") {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      fetchAdminStats();
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchAdminStats, user?.role]);

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

      if (user?.role === "admin" && statRefreshActions.has(activity.action)) {
        fetchAdminStats();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [fetchAdminStats, token, user?.role]);

  const analytics = adminStats?.analytics || {};
  const recentAdminActivity = useMemo(
    () => (adminStats?.recentActivity || []).slice(0, 5),
    [adminStats]
  );

  const adminStatCards = [
    {
      label: "Active rooms",
      value: adminStats?.activeRooms ?? adminStats?.totalRooms ?? 0,
      icon: Video,
      to: "/rooms",
      accent: "from-sky-300/30 via-lavender-200/35 to-white/20",
      iconAccent: "from-sky-200 to-lavender-200",
      glow: "bg-sky-300/30",
      helper: "Rooms currently available",
    },
    {
      label: "Active meetings",
      value: adminStats?.activeMeetings ?? adminStats?.activeCallsCount ?? 0,
      icon: Radio,
      to: "/rooms",
      accent: "from-mint-300/35 via-emerald-200/35 to-white/20",
      iconAccent: "from-mint-300 to-emerald-200",
      glow: "bg-mint-300/35",
      helper: "Live meetings happening now",
    },
    {
      label: "Online users",
      value: adminStats?.onlineUsersCount ?? 0,
      icon: Activity,
      to: "/admin/users",
      accent: "from-lavender-500/20 via-violet-200/35 to-white/20",
      iconAccent: "from-lavender-200 to-violet-200",
      glow: "bg-lavender-500/25",
      helper: "Users connected in realtime",
    },
    {
      label: "Pending invitations",
      value: adminStats?.pendingInvitations ?? 0,
      icon: MailQuestion,
      action: () => window.dispatchEvent(new Event("open-notifications")),
      accent: "from-amber-200/40 via-rose-200/30 to-white/20",
      iconAccent: "from-amber-200 to-rose-200",
      glow: "bg-amber-200/40",
      helper: "Invitations awaiting response",
    },
  ];

  const roomActivityData = analytics.roomActivityDistribution?.length
    ? analytics.roomActivityDistribution
    : emptyDistribution;
  const hasRoomActivity = roomActivityData.some((item) => item.value > 0);
  const roleDistributionData = analytics.userRoleDistribution?.length
    ? analytics.userRoleDistribution
    : emptyDistribution;
  const activityTrendData = analytics.activityTrend?.length
    ? analytics.activityTrend
    : Array.from({ length: Number(activityTimeframe.replace("D", "")) }, (_, index) => ({
        day: index === 0 ? "Start" : index === Number(activityTimeframe.replace("D", "")) - 1 ? "Today" : "",
        count: 0,
      }));
  const hasActivityTrend = activityTrendData.some((item) => item.count > 0);

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
            const cardContent = (
              <>
                <div className={`absolute inset-x-0 top-0 h-28 bg-gradient-to-br ${card.accent}`} />
                <div className={`absolute right-4 top-4 h-20 w-20 rounded-full ${card.glow} blur-2xl transition duration-300 group-hover:scale-125 group-hover:opacity-90`} />
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full border border-white/60 bg-white/25 opacity-70 transition duration-300 group-hover:rotate-12" />
                <div className="relative flex h-full flex-col">
                  <div className="mb-7 flex items-start justify-between gap-4">
                    <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${card.iconAccent} text-navy-900 shadow-soft transition duration-300 group-hover:-translate-y-1 group-hover:shadow-lift`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <ArrowUpRight className="h-5 w-5 text-lavender-500 transition group-hover:translate-x-1 group-hover:-translate-y-1" />
                  </div>
                  <p className="text-sm font-bold text-slate-500">{card.label}</p>
                  <p className="mt-3 text-4xl font-black tracking-tight text-navy-900">
                    {isAdminStatsLoading ? "..." : card.value}
                  </p>
                  <p className="mt-auto pt-4 text-sm font-medium leading-5 text-slate-500">{card.helper}</p>
                </div>
              </>
            );

            if (card.to) {
              return (
                <Link key={card.label} to={card.to} className="premium-card group relative min-h-48 overflow-hidden p-6">
                  {cardContent}
                </Link>
              );
            }

            return (
              <button
                key={card.label}
                type="button"
                onClick={card.action}
                className="premium-card group relative min-h-48 overflow-hidden p-6 text-left"
              >
                {cardContent}
              </button>
            );
          })}
        </div>

        <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="soft-panel p-5">
            <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="inline-flex items-center gap-2 text-xl font-black text-navy-900">
                  <BarChart3 className="h-5 w-5 text-lavender-500" />
                  Workspace Activity Trend
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Daily meetings that happened in active rooms for the selected timeframe.
                </p>
              </div>
              <div className="inline-flex w-fit rounded-xl border border-white/70 bg-white/65 p-1 shadow-sm backdrop-blur">
                {timeframeOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setActivityTimeframe(option)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${
                      activityTimeframe === option
                        ? "bg-navy-900 text-white shadow-soft"
                        : "text-slate-500 hover:bg-white hover:text-navy-900"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityTrendData} margin={{ left: -20, right: 8, top: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="activityGradient" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="#8B7CFF" stopOpacity={0.38} />
                      <stop offset="95%" stopColor="#8B7CFF" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#E8E3F6" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    interval={activityTimeframe === "7D" ? 0 : "preserveStartEnd"}
                    minTickGap={24}
                    tickLine={false}
                    tick={{ fill: "#64748B", fontSize: 12 }}
                  />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#64748B", fontSize: 12 }} />
                  <Tooltip
                    cursor={{ stroke: "#8B7CFF", strokeDasharray: "4 4" }}
                    formatter={(value) => [value, "Meetings happened"]}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.date || "Activity"}
                    contentStyle={{ border: "0", borderRadius: "12px", boxShadow: "0 18px 45px rgba(30, 27, 75, 0.12)" }}
                  />
                  <Area type="monotone" dataKey="count" name="Meetings happened" stroke="#8B7CFF" strokeWidth={3} fill="url(#activityGradient)" />
                </AreaChart>
              </ResponsiveContainer>
              {!hasActivityTrend && !isAdminStatsLoading && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="rounded-2xl border border-white/70 bg-white/80 px-5 py-4 text-center shadow-soft backdrop-blur-xl">
                    <BarChart3 className="mx-auto mb-2 h-6 w-6 text-lavender-500" />
                    <p className="text-sm font-black text-navy-900">No meetings yet</p>
                    <p className="mt-1 text-xs text-slate-500">Meeting counts will appear here as teams start calls.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="soft-panel p-5">
            <div className="mb-5">
              <h2 className="inline-flex items-center gap-2 text-xl font-black text-navy-900">
                <PieChartIcon className="h-5 w-5 text-mint-500" />
                User roles
              </h2>
              <p className="mt-1 text-sm text-slate-500">Current account count grouped by role.</p>
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
                  <Tooltip
                    formatter={(value, name) => [`${value} users`, name]}
                    contentStyle={{ border: "0", borderRadius: "12px", boxShadow: "0 18px 45px rgba(30, 27, 75, 0.12)" }}
                  />
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
              <p className="mt-1 text-sm text-slate-500">
                Current totals for rooms, meetings, accepted invitations, and moderator actions.
              </p>
            </div>
            <div className="relative h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roomActivityData} layout="vertical" margin={{ left: 10, right: 18, top: 6, bottom: 6 }}>
                  <defs>
                    <linearGradient id="roomBarGradient" x1="0" x2="1" y1="0" y2="0">
                      <stop offset="0%" stopColor="#3BC98E" stopOpacity={0.92} />
                      <stop offset="100%" stopColor="#8B7CFF" stopOpacity={0.86} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#E8E3F6" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#64748B", fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={132} axisLine={false} tickLine={false} tick={{ fill: "#334155", fontSize: 12, fontWeight: 600 }} />
                  <Tooltip
                    cursor={{ fill: "rgba(139, 124, 255, 0.08)" }}
                    content={<RoomActivityTooltip />}
                    contentStyle={{ border: "0", borderRadius: "14px", boxShadow: "0 18px 45px rgba(30, 27, 75, 0.14)" }}
                  />
                  <Bar dataKey="value" radius={[0, 12, 12, 0]} fill="url(#roomBarGradient)" barSize={22} animationDuration={700} />
                </BarChart>
              </ResponsiveContainer>
              {!hasRoomActivity && !isAdminStatsLoading && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="rounded-2xl border border-white/70 bg-white/80 px-5 py-4 text-center shadow-soft backdrop-blur-xl">
                    <Video className="mx-auto mb-2 h-6 w-6 text-lavender-500" />
                    <p className="text-sm font-black text-navy-900">No operational room activity yet</p>
                    <p className="mt-1 text-xs text-slate-500">Current rooms and live operational totals will appear here.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="soft-panel p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="inline-flex items-center gap-2 text-xl font-black text-navy-900">
                  <Activity className="h-5 w-5 text-mint-500" />
                  Recent activity
                </h2>
                <p className="mt-1 text-sm text-slate-500">Latest 5 operational events only.</p>
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
