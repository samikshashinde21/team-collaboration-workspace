const mongoose = require("mongoose");
const ActivityLog = require("../models/ActivityLog");
const Room = require("../models/Room");
const { canAccessRoom } = require("../services/roomAccess");
const { formatActivity, populateActivity } = require("../services/activityLogger");

const getAccessibleRoomIds = async (user) => {
  const rooms = await Room.find()
    .populate("members", "name email role")
    .populate("assignedUsers", "name email role")
    .select("_id isOpenToEveryone members assignedUsers");

  return rooms.filter((room) => canAccessRoom(user, room).allowed).map((room) => room._id);
};

const buildActivityQuery = async (req, baseQuery = {}) => {
  const query = { ...baseQuery };
  const { roomId, meetingId, recent } = req.query;

  if (roomId) {
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return { error: { status: 400, message: "Valid room id is required." } };
    }

    query.room = roomId;
  }

  if (meetingId) {
    if (!mongoose.Types.ObjectId.isValid(meetingId)) {
      return { error: { status: 400, message: "Valid meeting id is required." } };
    }

    query.meeting = meetingId;
  }

  if (recent === "true") {
    query.timestamp = { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
  }

  if (req.user.role !== "admin" && req.user.role !== "moderator") {
    const accessibleRoomIds = await getAccessibleRoomIds(req.user);
    query.$or = [
      { actor: req.user._id },
      { targetUser: req.user._id },
      { room: { $in: accessibleRoomIds } },
    ];
  }

  return { query };
};

const getActivity = async (req, res) => {
  try {
    const { query, error } = await buildActivityQuery(req);

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const limit = Math.min(Number(req.query.limit) || 25, 100);
    const activity = await populateActivity(
      ActivityLog.find(query).sort({ timestamp: -1, createdAt: -1 }).limit(limit)
    );

    res.json(activity.map(formatActivity));
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch activity", error: error.message });
  }
};

const getRoomActivity = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Valid room id is required." });
    }

    const room = await Room.findById(req.params.id)
      .populate("members", "name email role")
      .populate("assignedUsers", "name email role");

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const access = canAccessRoom(req.user, room);

    if (!access.allowed) {
      return res.status(403).json({ message: access.message });
    }

    const { query, error } = await buildActivityQuery(req, { room: room._id });

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const activity = await populateActivity(
      ActivityLog.find(query).sort({ timestamp: -1, createdAt: -1 }).limit(limit)
    );

    res.json(activity.map(formatActivity));
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch room activity", error: error.message });
  }
};

module.exports = {
  getActivity,
  getRoomActivity,
};
