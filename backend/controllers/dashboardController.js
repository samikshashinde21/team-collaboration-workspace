const ActivityLog = require("../models/ActivityLog");
const Meeting = require("../models/Meeting");
const Room = require("../models/Room");
const RoomInvitation = require("../models/RoomInvitation");
const User = require("../models/User");
const { formatActivity, populateActivity } = require("../services/activityLogger");
const { getPresenceStats } = require("../services/presenceStore");

const roomActivityLabels = {
  CURRENT_ROOMS: "Current rooms",
  MEETING_STARTED: "Meetings started",
  INVITATION_ACCEPTED: "Invitations accepted",
  USER_MUTED: "Users muted",
  USER_KICKED: "Users removed",
  USER_ROLE_UPDATED: "Role changes",
  SCREEN_SHARE_BLOCKED: "Access revoked",
};

const roomModerationActions = [
  "USER_MUTED",
  "USER_KICKED",
  "SCREEN_SHARE_BLOCKED",
  "USER_ROLE_UPDATED",
];

const recentOperationalActions = [
  "ROOM_CREATED",
  "ROOM_DELETED",
  "INVITATION_ACCEPTED",
  "INVITATION_REJECTED",
  "MEETING_STARTED",
  "MEETING_ENDED",
  ...roomModerationActions,
];

const activityTrendActions = [
  "MEETING_STARTED",
];

const safeAsync = async (operation, fallback) => {
  try {
    return await operation();
  } catch {
    return fallback;
  }
};

const countMeetingsForExistingRooms = async (match = {}) => {
  const rows = await Meeting.aggregate([
    { $match: match },
    {
      $lookup: {
        from: "rooms",
        localField: "room",
        foreignField: "_id",
        as: "roomDoc",
      },
    },
    { $match: { roomDoc: { $ne: [] } } },
    { $count: "count" },
  ]);

  return rows[0]?.count || 0;
};

const countInvitationsForExistingRooms = async (match = {}) => {
  const rows = await RoomInvitation.aggregate([
    { $match: match },
    {
      $lookup: {
        from: "rooms",
        localField: "room",
        foreignField: "_id",
        as: "roomDoc",
      },
    },
    { $match: { roomDoc: { $ne: [] } } },
    { $count: "count" },
  ]);

  return rows[0]?.count || 0;
};

const countActivityForExistingRooms = async (actions) => {
  const rows = await ActivityLog.aggregate([
    { $match: { action: { $in: actions }, room: { $ne: null } } },
    {
      $lookup: {
        from: "rooms",
        localField: "room",
        foreignField: "_id",
        as: "roomDoc",
      },
    },
    { $match: { roomDoc: { $ne: [] } } },
    {
      $group: {
        _id: "$action",
        count: { $sum: 1 },
      },
    },
  ]);

  return rows.reduce((map, row) => {
    map[row._id] = row.count;
    return map;
  }, {});
};

const buildCurrentRoomActivityDistribution = async (currentRooms) => {
  const [meetingsStarted, invitationsAccepted, moderationCounts] =
    await Promise.all([
      safeAsync(() => countMeetingsForExistingRooms({ status: { $in: ["active", "ended"] } }), 0),
      safeAsync(() => countInvitationsForExistingRooms({ status: "accepted" }), 0),
      safeAsync(() => countActivityForExistingRooms(roomModerationActions), {}),
    ]);
  const moderationDetails = [
    { name: roomActivityLabels.USER_MUTED, value: moderationCounts.USER_MUTED || 0 },
    { name: roomActivityLabels.USER_KICKED, value: moderationCounts.USER_KICKED || 0 },
    { name: roomActivityLabels.USER_ROLE_UPDATED, value: moderationCounts.USER_ROLE_UPDATED || 0 },
    { name: roomActivityLabels.SCREEN_SHARE_BLOCKED, value: moderationCounts.SCREEN_SHARE_BLOCKED || 0 },
  ];

  return [
    { name: roomActivityLabels.CURRENT_ROOMS, value: currentRooms },
    { name: roomActivityLabels.MEETING_STARTED, value: meetingsStarted },
    { name: roomActivityLabels.INVITATION_ACCEPTED, value: invitationsAccepted },
    {
      name: "Moderator actions",
      value: moderationDetails.reduce((sum, item) => sum + item.value, 0),
      details: moderationDetails,
    },
  ];
};

const roleLabels = {
  admin: "Admins",
  moderator: "Moderators",
  user: "Users",
};

const emptyAnalytics = {
  roomActivityDistribution: [],
  userRoleDistribution: [],
  activityTrend: [],
};

const getTrendWindowDays = (value) => {
  const days = Number(value);

  return [7, 30, 90].includes(days) ? days : 7;
};

const buildActivityTrend = (activityCounts, days) => {
  const countMap = activityCounts.reduce((map, item) => {
    map[item._id] = item.count;
    return map;
  }, {});

  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (days - 1 - index));

    const key = date.toISOString().slice(0, 10);

    return {
      day:
        days === 7
          ? date.toLocaleDateString("en", { timeZone: "UTC", weekday: "short" })
          : date.toLocaleDateString("en", { timeZone: "UTC", month: "short", day: "numeric" }),
      date: key,
      count: countMap[key] || 0,
    };
  });
};

const getDashboardAnalytics = async ({ trendStartDate, trendDays, currentRooms }) => {
  try {
    const [roomActivityDistribution, roleCounts, activityTrendCounts] = await Promise.all([
      buildCurrentRoomActivityDistribution(currentRooms),
      User.aggregate([
        {
          $group: {
            _id: "$role",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),
      ActivityLog.aggregate([
        {
          $match: {
            action: { $in: activityTrendActions },
            timestamp: { $gte: trendStartDate },
            room: { $ne: null },
          },
        },
        {
          $lookup: {
            from: "rooms",
            localField: "room",
            foreignField: "_id",
            as: "roomDoc",
          },
        },
        { $match: { roomDoc: { $ne: [] } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    return {
      roomActivityDistribution,
      userRoleDistribution: roleCounts.map((item) => ({
        name: roleLabels[item._id] || item._id || "Unknown",
        value: item.count,
      })),
      activityTrend: buildActivityTrend(activityTrendCounts, trendDays),
    };
  } catch {
    return {
      ...emptyAnalytics,
      activityTrend: buildActivityTrend([], trendDays),
    };
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const trendDays = getTrendWindowDays(req.query.timeframe);
    const trendStartDate = new Date();
    trendStartDate.setUTCHours(0, 0, 0, 0);
    trendStartDate.setUTCDate(trendStartDate.getUTCDate() - (trendDays - 1));

    const [totalUsers, totalRooms, activeMeetings, pendingInvitations, recentActivity] =
      await Promise.all([
        safeAsync(() => User.countDocuments(), 0),
        safeAsync(() => Room.countDocuments(), 0),
        safeAsync(() => countMeetingsForExistingRooms({ status: "active" }), 0),
        safeAsync(() => countInvitationsForExistingRooms({ status: "pending" }), 0),
        safeAsync(
          () =>
            populateActivity(
              ActivityLog.find({ action: { $in: recentOperationalActions } })
                .sort({ timestamp: -1, createdAt: -1 })
                .limit(5)
            ),
          []
        ),
      ]);

    const analytics = await safeAsync(
      () =>
        getDashboardAnalytics({
          trendStartDate,
          trendDays,
          currentRooms: totalRooms,
        }),
      {
        ...emptyAnalytics,
        activityTrend: buildActivityTrend([], trendDays),
      }
    );

    const { onlineUsersCount, activeCallsCount } = await safeAsync(
      () => Promise.resolve(getPresenceStats()),
      { onlineUsersCount: 0, activeCallsCount: 0 }
    );
    const formattedRecentActivity = recentActivity
      .map((activity) => safeAsync(() => Promise.resolve(formatActivity(activity)), null));
    const resolvedRecentActivity = (await Promise.all(formattedRecentActivity)).filter(Boolean);

    res.json({
      totalUsers,
      totalRooms,
      activeRooms: totalRooms,
      activeMeetings,
      pendingInvitations,
      onlineUsersCount,
      activeCallsCount,
      recentActivity: resolvedRecentActivity,
      analytics,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch dashboard stats", error: error.message });
  }
};

module.exports = {
  getDashboardStats,
};
