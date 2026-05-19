const mongoose = require("mongoose");
const Room = require("../models/Room");
const ActivityLog = require("../models/ActivityLog");
const User = require("../models/User");
const { canAccessRoom, validateRoomPermissions } = require("../services/roomAccess");

const createRoom = async (req, res) => {
  try {
    const {
      name,
      description,
      isPrivate = false,
      allowedUsers = [],
      allowedRoles = [],
      locked,
      isLocked,
    } = req.body;
    const roomIsPrivate = Boolean(isPrivate);
    const roomIsLocked = Boolean(locked ?? isLocked);

    if (!name?.trim()) {
      return res.status(400).json({ message: "Room name is required" });
    }

    const validationMessage = validateRoomPermissions({
      isPrivate: roomIsPrivate,
      allowedUsers,
      allowedRoles,
    });

    if (validationMessage) {
      return res.status(400).json({ message: validationMessage });
    }

    const uniqueAllowedUsers = [...new Set(allowedUsers)];
    const uniqueAllowedRoles = [...new Set(allowedRoles)];

    if (uniqueAllowedUsers.some((userId) => !mongoose.Types.ObjectId.isValid(userId))) {
      return res.status(400).json({ message: "Allowed users must be valid user ids." });
    }

    const existingAllowedUsers =
      uniqueAllowedUsers.length > 0
        ? await User.find({ _id: { $in: uniqueAllowedUsers } }).select("_id")
        : [];

    if (existingAllowedUsers.length !== uniqueAllowedUsers.length) {
      return res.status(400).json({ message: "One or more assigned users were not found." });
    }

    const room = await Room.create({
      name: name.trim(),
      description,
      isPrivate: roomIsPrivate,
      allowedUsers: roomIsPrivate ? uniqueAllowedUsers : [],
      allowedRoles: roomIsPrivate ? uniqueAllowedRoles : [],
      locked: roomIsLocked,
      isLocked: roomIsLocked,
      createdBy: req.user._id,
      members: [req.user._id],
    });

    await ActivityLog.create({
      user: req.user._id,
      room: room._id,
      action: "ROOM_CREATED",
      details: `${req.user.name} created ${room.name}`,
    });

    const createdRoom = await Room.findById(room._id)
      .populate("createdBy", "name email role")
      .populate("members", "name email role")
      .populate("allowedUsers", "name email role");

    res.status(201).json(createdRoom);
  } catch (error) {
    res.status(500).json({ message: "Failed to create room", error: error.message });
  }
};

const getRooms = async (req, res) => {
  try {
    const rooms = await Room.find()
      .populate("createdBy", "name email role")
      .populate("members", "name email role")
      .populate("allowedUsers", "name email role")
      .sort({ createdAt: -1 });

    res.json(rooms.filter((room) => canAccessRoom(req.user, room).allowed));
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch rooms", error: error.message });
  }
};

const getRoomById = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id)
      .populate("createdBy", "name email role")
      .populate("members", "name email role")
      .populate("allowedUsers", "name email role");

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const access = canAccessRoom(req.user, room);

    if (!access.allowed) {
      return res.status(403).json({ message: access.message });
    }

    res.json(room);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch room", error: error.message });
  }
};

const deleteRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    await room.deleteOne();

    await ActivityLog.create({
      user: req.user._id,
      action: "ROOM_DELETED",
      details: `${req.user.name} deleted ${room.name}`,
    });

    res.json({ message: "Room deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete room", error: error.message });
  }
};

module.exports = {
  createRoom,
  getRooms,
  getRoomById,
  deleteRoom,
};
