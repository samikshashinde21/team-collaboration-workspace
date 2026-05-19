const mongoose = require("mongoose");
const Room = require("../models/Room");
const ActivityLog = require("../models/ActivityLog");
const RoomInvitation = require("../models/RoomInvitation");
const User = require("../models/User");
const { canAccessRoom, validateRoomPermissions } = require("../services/roomAccess");

const formatInvitationNotification = (invitation) => ({
  id: invitation._id.toString(),
  room: {
    id: invitation.room._id.toString(),
    name: invitation.room.name,
  },
  invitedBy: {
    id: invitation.invitedBy._id.toString(),
    name: invitation.invitedBy.name,
    email: invitation.invitedBy.email,
    role: invitation.invitedBy.role,
  },
  invitedUser: {
    id: invitation.invitedUser._id.toString(),
    name: invitation.invitedUser.name,
    email: invitation.invitedUser.email,
    role: invitation.invitedUser.role,
  },
  description: invitation.description,
  status: invitation.status,
  invitedUserRead: invitation.invitedUserRead,
  inviterRead: invitation.inviterRead,
  createdAt: invitation.createdAt,
  updatedAt: invitation.updatedAt,
});

const createRoom = async (req, res) => {
  try {
    const {
      name,
      description,
      isOpenToEveryone = true,
      assignedUsers = [],
    } = req.body;
    const roomIsOpenToEveryone = Boolean(isOpenToEveryone);

    if (!name?.trim()) {
      return res.status(400).json({ message: "Room name is required" });
    }

    const validationMessage = validateRoomPermissions({
      assignedUsers,
    });

    if (validationMessage) {
      return res.status(400).json({ message: validationMessage });
    }

    const uniqueAssignedUsers = [...new Set(assignedUsers)];

    if (uniqueAssignedUsers.some((userId) => !mongoose.Types.ObjectId.isValid(userId))) {
      return res.status(400).json({ message: "Assigned users must be valid user ids." });
    }

    const existingAssignedUsers =
      uniqueAssignedUsers.length > 0
        ? await User.find({ _id: { $in: uniqueAssignedUsers } }).select("_id")
        : [];

    if (existingAssignedUsers.length !== uniqueAssignedUsers.length) {
      return res.status(400).json({ message: "One or more assigned users were not found." });
    }

    const room = await Room.create({
      name: name.trim(),
      description,
      isOpenToEveryone: roomIsOpenToEveryone,
      assignedUsers: [],
      createdBy: req.user._id,
      members: [req.user._id],
    });

    await ActivityLog.create({
      user: req.user._id,
      room: room._id,
      action: "ROOM_CREATED",
      details: `${req.user.name} created ${room.name}`,
    });

    const invitationUserIds = roomIsOpenToEveryone
      ? (
          await User.find({ _id: { $ne: req.user._id } }).select("_id")
        ).map((invitee) => invitee._id.toString())
      : uniqueAssignedUsers;

    if (invitationUserIds.length > 0) {
      const invitations = await RoomInvitation.insertMany(
        invitationUserIds.map((assignedUserId) => ({
          room: room._id,
          invitedBy: req.user._id,
          invitedUser: assignedUserId,
          description: description || "",
        })),
        { ordered: false }
      );
      const populatedInvitations = await RoomInvitation.find({
        _id: { $in: invitations.map((invitation) => invitation._id) },
      })
        .populate("room", "name")
        .populate("invitedBy", "name email role")
        .populate("invitedUser", "name email role");
      const io = req.app.get("io");

      populatedInvitations.forEach((invitation) => {
        io
          ?.to(`user:${invitation.invitedUser._id.toString()}`)
          .emit("room-invitation", formatInvitationNotification(invitation));
      });
    }

    const createdRoom = await Room.findById(room._id)
      .populate("createdBy", "name email role")
      .populate("members", "name email role")
      .populate("assignedUsers", "name email role");

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
      .populate("assignedUsers", "name email role")
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
      .populate("assignedUsers", "name email role");

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
