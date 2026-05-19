const ActivityLog = require("../models/ActivityLog");
const Room = require("../models/Room");
const User = require("../models/User");
const { getPresenceStats } = require("../services/presenceStore");

const getDashboardStats = async (req, res) => {
  try {
    const [totalUsers, totalRooms, recentActivity] = await Promise.all([
      User.countDocuments(),
      Room.countDocuments(),
      ActivityLog.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("user", "name email role")
        .populate("room", "name"),
    ]);

    const { onlineUsersCount, activeCallsCount } = getPresenceStats();

    res.json({
      totalUsers,
      totalRooms,
      onlineUsersCount,
      activeCallsCount,
      recentActivity: recentActivity.map((activity) => ({
        id: activity._id.toString(),
        action: activity.action,
        details: activity.details,
        user: activity.user
          ? {
              id: activity.user._id.toString(),
              name: activity.user.name,
              email: activity.user.email,
              role: activity.user.role,
            }
          : null,
        room: activity.room
          ? {
              id: activity.room._id.toString(),
              name: activity.room.name,
            }
          : null,
        createdAt: activity.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch dashboard stats", error: error.message });
  }
};

module.exports = {
  getDashboardStats,
};
