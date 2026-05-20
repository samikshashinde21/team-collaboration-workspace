const ActivityLog = require("../models/ActivityLog");
const Meeting = require("../models/Meeting");
const Room = require("../models/Room");
const User = require("../models/User");
const { formatActivity, populateActivity } = require("../services/activityLogger");
const { getPresenceStats } = require("../services/presenceStore");

const roomActivityLabels = {
  ROOM_CREATED: "Created",
  ROOM_JOINED: "Joined",
  ROOM_LEFT: "Left",
  MEETING_STARTED: "Meetings started",
  MEETING_ENDED: "Meetings ended",
};

const roleLabels = {
  admin: "Admins",
  moderator: "Moderators",
  user: "Users",
};

const emptyAnalytics = {
  roomActivityDistribution: [],
  userRoleDistribution: [],
  weeklyWorkspaceActivity: [],
};

const buildWeeklyActivity = (activityCounts) => {
  const countMap = activityCounts.reduce((map, item) => {
    map[item._id] = item.count;
    return map;
  }, {});

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (6 - index));

    const key = date.toISOString().slice(0, 10);

    return {
      day: date.toLocaleDateString("en", { timeZone: "UTC", weekday: "short" }),
      count: countMap[key] || 0,
    };
  });
};

const getDashboardAnalytics = async (lastSevenDays) => {
  try {
    const [roomActivityCounts, roleCounts, weeklyActivityCounts] = await Promise.all([
      ActivityLog.aggregate([
        {
          $match: {
            action: { $in: Object.keys(roomActivityLabels) },
          },
        },
        {
          $group: {
            _id: "$action",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),
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
            timestamp: { $gte: lastSevenDays },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    return {
      roomActivityDistribution: roomActivityCounts.map((item) => ({
        name: roomActivityLabels[item._id] || String(item._id || "Other").replaceAll("_", " ").toLowerCase(),
        value: item.count,
      })),
      userRoleDistribution: roleCounts.map((item) => ({
        name: roleLabels[item._id] || item._id || "Unknown",
        value: item.count,
      })),
      weeklyWorkspaceActivity: buildWeeklyActivity(weeklyActivityCounts),
    };
  } catch {
    return {
      ...emptyAnalytics,
      weeklyWorkspaceActivity: buildWeeklyActivity([]),
    };
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const lastSevenDays = new Date();
    lastSevenDays.setUTCHours(0, 0, 0, 0);
    lastSevenDays.setUTCDate(lastSevenDays.getUTCDate() - 6);

    const [totalUsers, totalRooms, activeMeetings, recentActivity, analytics] = await Promise.all([
      User.countDocuments(),
      Room.countDocuments(),
      Meeting.countDocuments({ status: "active" }),
      populateActivity(ActivityLog.find().sort({ timestamp: -1, createdAt: -1 }).limit(5)),
      getDashboardAnalytics(lastSevenDays),
    ]);

    const { onlineUsersCount, activeCallsCount } = getPresenceStats();

    res.json({
      totalUsers,
      totalRooms,
      activeRooms: totalRooms,
      activeMeetings,
      onlineUsersCount,
      activeCallsCount,
      recentActivity: recentActivity.map(formatActivity),
      analytics,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch dashboard stats", error: error.message });
  }
};

module.exports = {
  getDashboardStats,
};
