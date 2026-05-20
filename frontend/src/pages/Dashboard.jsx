import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clock3,
  DoorOpen,
  MailQuestion,
  PieChart as PieChartIcon,
  Radio,
  Shield,
  Users,
  Video,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
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
const personalActivityActions = new Set([
  "INVITATION_SENT",
  "INVITATION_ACCEPTED",
  "USER_ROLE_UPDATED",
  "MEETING_STARTED",
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

const formatDashboardTime = (value) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const MeetingBadge = ({ status }) => {
  const classes = {
    scheduled: "bg-lavender-200/70 text-navy-900",
    active: "bg-emerald-100 text-emerald-700 ring-4 ring-emerald-300/20",
    ended: "bg-slate-100 text-slate-600",
  };
  const labels = {
    scheduled: "Scheduled",
    active: "Live",
    ended: "Completed",
  };

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${classes[status] || classes.ended}`}>
      {labels[status] || status}
    </span>
  );
};

const Dashboard = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [activities, setActivities] = useState([]);
  const [adminStats, setAdminStats] = useState(null);
  const [adminError, setAdminError] = useState("");
  const [isAdminStatsLoading, setIsAdminStatsLoading] = useState(user?.role === "admin");
  const [activityTimeframe, setActivityTimeframe] = useState("7D");
  const [rooms, setRooms] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [userDashboardError, setUserDashboardError] = useState("");
  const [isUserDashboardLoading, setIsUserDashboardLoading] = useState(user?.role !== "admin");

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

    const timeoutId = window.setTimeout(() => {
      fetchAdminStats({ showLoading: true });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [fetchAdminStats, user?.role]);

  useEffect(() => {
    if (user?.role === "admin") {
      return undefined;
    }

    let isMounted = true;

    const fetchUserDashboard = async () => {
      setIsUserDashboardLoading(true);
      setUserDashboardError("");

      try {
        const [{ data: roomsData }, { data: invitationsData }] = await Promise.all([
          api.get("/rooms"),
          api.get("/invitations/my"),
        ]);
        const meetingResponses = await Promise.all(
          roomsData.map((room) =>
            api
              .get(`/rooms/${room._id}/meetings`)
              .then(({ data }) => data.map((meeting) => ({ ...meeting, roomName: room.name, roomId: room._id })))
              .catch(() => [])
          )
        );

        if (isMounted) {
          setRooms(roomsData);
          setInvitations(invitationsData);
          setMeetings(meetingResponses.flat());
        }
      } catch (err) {
        if (isMounted) {
          setUserDashboardError(err.response?.data?.message || "Could not load your dashboard.");
        }
      } finally {
        if (isMounted) {
          setIsUserDashboardLoading(false);
        }
      }
    };

    fetchUserDashboard();

    return () => {
      isMounted = false;
    };
  }, [user?.role]);

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

    socket.on("room-meeting-scheduled", ({ roomId, meeting }) => {
      if (!roomId || !meeting) return;

      setMeetings((currentMeetings) => [
        { ...meeting, roomId, roomName: rooms.find((room) => room._id === roomId)?.name || "Room" },
        ...currentMeetings.filter((currentMeeting) => currentMeeting.id !== meeting.id),
      ]);
    });

    socket.on("room-meeting-updated", ({ roomId, meeting }) => {
      if (!roomId || !meeting) return;

      setMeetings((currentMeetings) => [
        { ...meeting, roomId, roomName: rooms.find((room) => room._id === roomId)?.name || "Room" },
        ...currentMeetings.filter((currentMeeting) => currentMeeting.id !== meeting.id),
      ]);
      setRooms((currentRooms) =>
        currentRooms.map((room) =>
          room._id === roomId
            ? { ...room, activeMeeting: meeting.status === "active" ? meeting : null }
            : room
        )
      );
    });

    return () => {
      socket.disconnect();
    };
  }, [fetchAdminStats, rooms, token, user?.role]);

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
      to: "/invitations",
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
  const pendingInvitations = invitations.filter(
    (invitation) => invitation.status === "pending" && invitation.invitedUser?.id === user?.id
  );
  const acceptedRoomIds = new Set(
    invitations
      .filter((invitation) => invitation.status === "accepted" && invitation.room?.id)
      .map((invitation) => invitation.room.id)
  );
  const userRooms = rooms.filter((room) => {
    const memberIds = new Set((room.members || []).map((member) => (member._id || member.id || member).toString()));
    return memberIds.has(user?.id) || acceptedRoomIds.has(room._id) || room.isOpenToEveryone;
  });
  const activeMeetings = meetings.filter((meeting) => meeting.status === "active");
  const liveMeeting = activeMeetings[0] || null;
  const upcomingMeetings = meetings
    .filter((meeting) => meeting.status === "scheduled" || meeting.status === "active")
    .sort((a, b) => {
      const timeA = new Date(a.status === "active" ? a.startedAt : a.scheduledFor || a.createdAt).getTime();
      const timeB = new Date(b.status === "active" ? b.startedAt : b.scheduledFor || b.createdAt).getTime();

      return timeA - timeB;
    })
    .slice(0, 8);
  const latestMeetingByRoomId = meetings.reduce((map, meeting) => {
    const currentMeeting = map.get(meeting.roomId);
    const currentTime = currentMeeting
      ? new Date(currentMeeting.endedAt || currentMeeting.startedAt || currentMeeting.scheduledFor || currentMeeting.createdAt || 0).getTime()
      : 0;
    const meetingTime = new Date(meeting.endedAt || meeting.startedAt || meeting.scheduledFor || meeting.createdAt || 0).getTime();

    if (!currentMeeting || meetingTime > currentTime) {
      map.set(meeting.roomId, meeting);
    }

    return map;
  }, new Map());
  const personalActivities = activities
    .filter((activity) => {
      if (!personalActivityActions.has(activity.action)) return false;
      if (activity.action === "INVITATION_SENT") return activity.targetUser?.id === user?.id;
      if (activity.action === "USER_ROLE_UPDATED") return activity.targetUser?.id === user?.id;

      return activity.actor?.id === user?.id || activity.targetUser?.id === user?.id || activity.action === "MEETING_STARTED";
    })
    .slice(0, 6);
  const syntheticMeetingActivities = meetings
    .filter((meeting) => meeting.status === "scheduled")
    .slice(0, 2)
    .map((meeting) => ({
      id: `scheduled-${meeting.id}`,
      action: "MEETING_SCHEDULED",
      room: { id: meeting.roomId, name: meeting.roomName },
      actor: meeting.scheduledBy,
      timestamp: meeting.createdAt || meeting.scheduledFor,
      description: `${meeting.title} scheduled for ${formatDashboardTime(meeting.scheduledFor)}`,
    }));
  const recentPersonalActivity = [...syntheticMeetingActivities, ...personalActivities]
    .sort((a, b) => new Date(b.timestamp || b.createdAt).getTime() - new Date(a.timestamp || a.createdAt).getTime())
    .slice(0, 6);
  const quickActions = [
    {
      label: "My Rooms",
      helper: `${userRooms.length} rooms available`,
      icon: DoorOpen,
      to: "/rooms",
      accent: "from-sky-200/50 to-lavender-200/35",
    },
    {
      label: "Upcoming Meetings",
      helper: `${upcomingMeetings.filter((meeting) => meeting.status === "scheduled").length} scheduled`,
      icon: CalendarClock,
      to: "/rooms",
      accent: "from-mint-300/35 to-white/30",
    },
    {
      label: "Pending Invitations",
      helper: `${pendingInvitations.length} awaiting response`,
      icon: MailQuestion,
      to: "/invitations",
      accent: "from-amber-200/50 to-rose-100/35",
    },
    {
      label: "Live Meeting",
      helper: liveMeeting ? `${liveMeeting.roomName} is live now` : "No live meeting right now",
      icon: Radio,
      to: liveMeeting ? `/rooms/${liveMeeting.roomId}/meeting/${liveMeeting.id}` : "/rooms",
      accent: "from-emerald-200/60 to-mint-300/30",
    },
  ];

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

  if (user?.role === "moderator") {
    return (
      <section className="relative space-y-6">
        <div className="pointer-events-none absolute -right-8 top-20 hidden h-36 w-36 rounded-[2rem] bg-sky-300/20 blur-2xl md:block" />

        <div className="page-hero overflow-hidden">
          <div className="max-w-3xl">
            <p className="section-kicker">Moderator Workspace</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-navy-900 md:text-5xl">
              Room operations, {user?.name}
            </h1>
            <p className="mt-3 max-w-2xl text-slate-600">
              Manage your assigned rooms, meetings, participants, invitations, and recent room activity.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <span className="status-pill bg-sky-100 text-sky-700">Moderator</span>
            <span className="status-pill">{userRooms.length} assigned rooms</span>
          </div>
        </div>

        {userDashboardError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {userDashboardError}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Assigned rooms", value: userRooms.length, icon: DoorOpen, to: "/rooms" },
            { label: "Live meetings", value: activeMeetings.length, icon: Radio, to: "/rooms" },
            { label: "Upcoming meetings", value: upcomingMeetings.filter((meeting) => meeting.status === "scheduled").length, icon: CalendarClock, to: "/rooms" },
            { label: "Pending invitations", value: pendingInvitations.length, icon: MailQuestion, to: "/invitations" },
          ].map((card) => {
            const Icon = card.icon;

            return (
              <Link key={card.label} to={card.to} className="premium-card group relative overflow-hidden p-5">
                <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-br from-sky-200/40 via-white/40 to-mint-300/20" />
                <div className="relative flex items-start justify-between gap-4">
                  <span className="icon-chip h-11 w-11">
                    <Icon className="h-5 w-5" />
                  </span>
                  <ArrowUpRight className="h-5 w-5 text-lavender-500 transition group-hover:translate-x-1 group-hover:-translate-y-1" />
                </div>
                <p className="relative mt-6 text-sm font-bold text-slate-500">{card.label}</p>
                <p className="relative mt-2 text-3xl font-black text-navy-900">{card.value}</p>
              </Link>
            );
          })}
        </div>

        {liveMeeting && (
          <Link to={`/rooms/${liveMeeting.roomId}/meeting/${liveMeeting.id}`} className="block rounded-3xl border border-emerald-200 bg-emerald-50/80 p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-black text-white">LIVE</span>
                <h2 className="mt-2 text-xl font-black text-navy-900">{liveMeeting.title}</h2>
                <p className="mt-1 text-sm text-slate-600">{liveMeeting.roomName}</p>
              </div>
              <span className="btn-primary w-fit bg-emerald-700">Join meeting</span>
            </div>
          </Link>
        )}

        <section className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
          <div className="soft-panel p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="inline-flex items-center gap-2 text-xl font-black text-navy-900">
                  <Video className="h-5 w-5 text-sky-500" />
                  Managed Rooms
                </h2>
                <p className="mt-1 text-sm text-slate-500">Rooms where your moderator tools are available.</p>
              </div>
              <Link to="/rooms" className="btn-secondary w-fit">View rooms</Link>
            </div>
            <div className="scroll-panel max-h-[24rem] space-y-3">
              {isUserDashboardLoading ? (
                <p className="rounded-xl bg-white/60 px-4 py-5 text-sm text-slate-600">Loading rooms...</p>
              ) : userRooms.length ? (
                userRooms.slice(0, 8).map((room) => (
                  <Link key={room._id} to={`/rooms/${room._id}`} className="block rounded-2xl border border-white/70 bg-white/65 px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-navy-900">{room.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{room.onlineParticipantsCount || 0} online participants</p>
                      </div>
                      {room.activeMeeting ? (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-700">Live</span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">Open</span>
                      )}
                    </div>
                  </Link>
                ))
              ) : (
                <p className="rounded-2xl border border-dashed border-slate-300 bg-white/55 px-4 py-8 text-center text-sm text-slate-600">
                  No assigned rooms yet.
                </p>
              )}
            </div>
          </div>

          <div className="soft-panel p-5">
            <div className="mb-4">
              <h2 className="inline-flex items-center gap-2 text-xl font-black text-navy-900">
                <Activity className="h-5 w-5 text-mint-500" />
                Room Activity
              </h2>
              <p className="mt-1 text-sm text-slate-500">Recent operational activity from rooms you can manage.</p>
            </div>
            <div className="scroll-panel max-h-[24rem]">
              <ActivityTimeline activities={recentPersonalActivity} emptyTitle="No room activity yet" compact />
            </div>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="relative space-y-6">
      <div className="pointer-events-none absolute -right-8 top-20 hidden h-36 w-36 rounded-[2rem] bg-mint-300/20 blur-2xl md:block" />
      <div className="pointer-events-none absolute -left-8 top-96 hidden h-28 w-48 rotate-6 rounded-[2rem] bg-lavender-200/30 blur-2xl lg:block" />

      <div className="page-hero overflow-hidden">
        <div className="absolute right-8 top-8 hidden h-24 w-40 rotate-6 rounded-[2rem] border border-white/60 bg-white/35 shadow-glow backdrop-blur-2xl md:block" />
        <div className="max-w-3xl">
          <p className="section-kicker">Your Workspace</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-navy-900 md:text-5xl">
            Welcome back, {user?.name}
          </h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Jump into active rooms, prepare for scheduled meetings, and respond to invites from one focused place.
          </p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/70 bg-white/65 px-4 py-3 shadow-sm backdrop-blur">
            <p className="text-xs font-bold uppercase text-slate-500">Upcoming meetings</p>
            <p className="mt-2 text-3xl font-black text-navy-900">{upcomingMeetings.length}</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/65 px-4 py-3 shadow-sm backdrop-blur">
            <p className="text-xs font-bold uppercase text-slate-500">Active rooms</p>
            <p className="mt-2 text-3xl font-black text-navy-900">{userRooms.length}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/invitations")}
            className="rounded-2xl border border-white/70 bg-white/65 px-4 py-3 text-left shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:shadow-soft"
          >
            <p className="text-xs font-bold uppercase text-slate-500">Pending invitations</p>
            <p className="mt-2 text-3xl font-black text-navy-900">{pendingInvitations.length}</p>
          </button>
        </div>
      </div>

      {userDashboardError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {userDashboardError}
        </div>
      )}

      {liveMeeting && (
        <Link
          to={`/rooms/${liveMeeting.roomId}/meeting/${liveMeeting.id}`}
          className="group block overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white/80 to-mint-300/20 p-5 shadow-lift transition hover:-translate-y-0.5"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700 ring-4 ring-emerald-300/20">
                <Radio className="h-5 w-5" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="animate-pulse rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-black text-white">
                    LIVE
                  </span>
                  <p className="text-sm font-bold text-emerald-700">{liveMeeting.roomName}</p>
                </div>
                <h2 className="mt-2 text-xl font-black text-navy-900">{liveMeeting.title}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {liveMeeting.activeParticipantCount ?? liveMeeting.participantCount ?? 0} participants connected
                </p>
              </div>
            </div>
            <span className="btn-primary w-fit bg-emerald-700 group-hover:bg-emerald-800">
              Join now
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
        </Link>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {quickActions.map((action) => {
          const Icon = action.icon;
          const content = (
            <>
              <div className={`absolute inset-x-0 top-0 h-20 bg-gradient-to-br ${action.accent}`} />
              <div className="relative flex items-start justify-between gap-4">
                <span className="icon-chip h-11 w-11">
                  <Icon className="h-5 w-5" />
                </span>
                <ArrowUpRight className="h-5 w-5 text-lavender-500 transition group-hover:translate-x-1 group-hover:-translate-y-1" />
              </div>
              <div className="relative mt-6">
                <h2 className="font-black text-navy-900">{action.label}</h2>
                <p className="mt-2 text-sm text-slate-600">{action.helper}</p>
              </div>
            </>
          );

          if (action.action) {
            return (
              <button key={action.label} type="button" onClick={action.action} className="premium-card group relative overflow-hidden p-5 text-left">
                {content}
              </button>
            );
          }

          return (
            <Link key={action.label} to={action.to} className="premium-card group relative overflow-hidden p-5">
              {content}
            </Link>
          );
        })}
      </div>

      <section className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <div className="soft-panel p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="inline-flex items-center gap-2 text-xl font-black text-navy-900">
                <CalendarClock className="h-5 w-5 text-lavender-500" />
                Upcoming Meetings
              </h2>
              <p className="mt-1 text-sm text-slate-500">Scheduled and live meetings in your rooms.</p>
            </div>
            <span className="status-pill">{upcomingMeetings.length}</span>
          </div>
          <div className="scroll-panel max-h-[24rem] space-y-3">
            {isUserDashboardLoading ? (
              <p className="rounded-xl bg-white/60 px-4 py-5 text-sm text-slate-600">Loading meetings...</p>
            ) : upcomingMeetings.length ? (
              upcomingMeetings.map((meeting) => (
                <div key={meeting.id} className="rounded-2xl border border-white/70 bg-white/65 px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft">
                  <div className="grid gap-3 lg:grid-cols-[1.2fr_0.9fr_auto] lg:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-navy-900">{meeting.title}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{meeting.roomName}</p>
                    </div>
                    <p className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatDashboardTime(meeting.status === "active" ? meeting.startedAt : meeting.scheduledFor)}
                    </p>
                    <div className="flex items-center gap-2 lg:justify-end">
                      <MeetingBadge status={meeting.status} />
                      {meeting.status === "active" && (
                        <Link to={`/rooms/${meeting.roomId}/meeting/${meeting.id}`} className="btn-primary px-3 py-1.5 text-xs">
                          Join
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/55 px-4 py-8 text-center">
                <CalendarClock className="mx-auto mb-2 h-6 w-6 text-lavender-500" />
                <p className="text-sm font-black text-navy-900">No meetings scheduled</p>
                <p className="mt-1 text-sm text-slate-500">Upcoming meetings will appear here.</p>
              </div>
            )}
          </div>
        </div>

        <div className="soft-panel p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="inline-flex items-center gap-2 text-xl font-black text-navy-900">
                <Video className="h-5 w-5 text-mint-500" />
                My Rooms
              </h2>
              <p className="mt-1 text-sm text-slate-500">Rooms you can open right now.</p>
            </div>
            <Link to="/rooms" className="btn-secondary w-fit">
              View all
            </Link>
          </div>
          <div className="scroll-panel max-h-[24rem] space-y-3">
            {isUserDashboardLoading ? (
              <p className="rounded-xl bg-white/60 px-4 py-5 text-sm text-slate-600">Loading rooms...</p>
            ) : userRooms.length ? (
              userRooms.slice(0, 8).map((room) => {
                const latestMeeting = latestMeetingByRoomId.get(room._id);

                return (
                  <div key={room._id} className="rounded-2xl border border-white/70 bg-white/65 px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-navy-900">{room.name}</p>
                        <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
                          <Users className="h-3.5 w-3.5" />
                          {room.onlineParticipantsCount || 0} online
                        </p>
                      </div>
                      <Link to={`/rooms/${room._id}`} className="btn-secondary px-3 py-1.5 text-xs">
                        Open
                      </Link>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {room.activeMeeting ? (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-700">Live meeting</span>
                      ) : latestMeeting ? (
                        <MeetingBadge status={latestMeeting.status} />
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">No meetings yet</span>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white/55 px-4 py-8 text-center">
                <DoorOpen className="mx-auto mb-2 h-6 w-6 text-lavender-500" />
                <p className="text-sm font-black text-navy-900">No rooms yet</p>
                <p className="mt-1 text-sm text-slate-500">Accepted rooms will appear here.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="soft-panel p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="inline-flex items-center gap-2 text-xl font-black text-navy-900">
              <CheckCircle2 className="h-5 w-5 text-mint-500" />
              Recent Personal Activity
            </h2>
            <p className="mt-1 text-sm text-slate-500">Invites, meeting updates, and account changes related to you.</p>
          </div>
          <span className="status-pill">{recentPersonalActivity.length} shown</span>
        </div>
        <div className="scroll-panel max-h-[22rem]">
          <ActivityTimeline activities={recentPersonalActivity} emptyTitle="No personal activity yet" compact />
        </div>
      </section>
    </section>
  );
};

export default Dashboard;
