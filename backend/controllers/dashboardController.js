const ActivityLog = require("../models/ActivityLog");
const Room = require("../models/Room");
const User = require("../models/User");
const { formatActivity, populateActivity } = require("../services/activityLogger");
const { getPresenceStats } = require("../services/presenceStore");

const getDashboardStats = async (req, res) => {
  try {
    const [totalUsers, totalRooms, recentActivity] = await Promise.all([
      User.countDocuments(),
      Room.countDocuments(),
      populateActivity(ActivityLog.find().sort({ timestamp: -1, createdAt: -1 }).limit(5)),
    ]);

    const { onlineUsersCount, activeCallsCount } = getPresenceStats();

    res.json({
      totalUsers,
      totalRooms,
      onlineUsersCount,
      activeCallsCount,
      recentActivity: recentActivity.map(formatActivity),
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch dashboard stats", error: error.message });
  }
};

module.exports = {
  getDashboardStats,
};
