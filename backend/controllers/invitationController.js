const mongoose = require("mongoose");
const Room = require("../models/Room");
const RoomInvitation = require("../models/RoomInvitation");
const User = require("../models/User");
const { ACTIONS, createActivityLog } = require("../services/activityLogger");

const formatInvitation = (invitation) => ({
  id: invitation._id.toString(),
  room: invitation.room
    ? {
        id: invitation.room._id.toString(),
        name: invitation.room.name,
      }
    : null,
  invitedBy: invitation.invitedBy
    ? {
        id: invitation.invitedBy._id.toString(),
        name: invitation.invitedBy.name,
        email: invitation.invitedBy.email,
        role: invitation.invitedBy.role,
      }
    : null,
  invitedUser: invitation.invitedUser
    ? {
        id: invitation.invitedUser._id.toString(),
        name: invitation.invitedUser.name,
        email: invitation.invitedUser.email,
        role: invitation.invitedUser.role,
      }
    : null,
  description: invitation.description,
  status: invitation.status,
  invitedUserRead: invitation.invitedUserRead,
  inviterRead: invitation.inviterRead,
  createdAt: invitation.createdAt,
  updatedAt: invitation.updatedAt,
});

const populateInvitation = (query) =>
  query
    .populate("room", "name")
    .populate("invitedBy", "name email role")
    .populate("invitedUser", "name email role");

const createInvitation = async (req, res) => {
  try {
    const { roomId, invitedUserId, description = "" } = req.body;

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: "Valid room id is required." });
    }

    if (!mongoose.Types.ObjectId.isValid(invitedUserId)) {
      return res.status(400).json({ message: "Valid invited user id is required." });
    }

    const [room, invitedUser] = await Promise.all([
      Room.findById(roomId),
      User.findById(invitedUserId).select("-password"),
    ]);

    if (!room) {
      return res.status(404).json({ message: "Room not found." });
    }

    if (!invitedUser) {
      return res.status(404).json({ message: "Invited user not found." });
    }

    if (invitedUser.role === "admin") {
      return res.status(400).json({ message: "Admins already have room access." });
    }

    const existingInvitation = await RoomInvitation.findOne({
      room: roomId,
      invitedUser: invitedUserId,
      status: { $in: ["pending", "accepted"] },
    });

    if (existingInvitation?.status === "pending") {
      return res.status(409).json({ message: "This user already has a pending invitation." });
    }

    if (existingInvitation?.status === "accepted") {
      return res.status(400).json({ message: "This user already accepted the invitation." });
    }

    const invitation = await RoomInvitation.create({
      room: roomId,
      invitedBy: req.user._id,
      invitedUser: invitedUserId,
      description: description.trim() || room.description || "",
    });

    const populatedInvitation = await populateInvitation(RoomInvitation.findById(invitation._id));
    const formattedInvitation = formatInvitation(populatedInvitation);
    const io = req.app.get("io");

    io?.to(`user:${invitedUserId}`).emit("room-invitation", formattedInvitation);

    await createActivityLog({
      io,
      actor: req.user._id,
      targetUser: invitedUserId,
      room: room._id,
      action: ACTIONS.INVITATION_SENT,
      description: `${req.user.name} invited ${invitedUser.name} to ${room.name}`,
    });

    res.status(201).json(formattedInvitation);
  } catch (error) {
    res.status(500).json({ message: "Failed to send invitation", error: error.message });
  }
};

const getMyInvitations = async (req, res) => {
  try {
    const invitations = await populateInvitation(
      RoomInvitation.find({
        $or: [{ invitedUser: req.user._id }, { invitedBy: req.user._id }],
      }).sort({ updatedAt: -1 })
    );

    res.json(invitations.map(formatInvitation));
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch invitations", error: error.message });
  }
};

const getRoomInvitations = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.roomId)) {
      return res.status(400).json({ message: "Valid room id is required." });
    }

    const room = await Room.findById(req.params.roomId);

    if (!room) {
      return res.status(404).json({ message: "Room not found." });
    }

    const invitations = await populateInvitation(
      RoomInvitation.find({ room: req.params.roomId }).sort({ createdAt: -1 })
    );

    res.json(invitations.map(formatInvitation));
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch room invitations", error: error.message });
  }
};

const updateInvitation = async (req, res) => {
  try {
    const { status } = req.body;

    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Status must be accepted or rejected." });
    }

    const invitation = await RoomInvitation.findById(req.params.id);

    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found." });
    }

    if (invitation.invitedUser.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You can only update your own invitations." });
    }

    if (invitation.status !== "pending") {
      return res.status(400).json({ message: "This invitation has already been handled." });
    }

    invitation.status = status;
    invitation.invitedUserRead = true;
    invitation.inviterRead = false;
    await invitation.save();

    if (status === "accepted") {
      await Room.findByIdAndUpdate(invitation.room, {
        $addToSet: { assignedUsers: req.user._id, members: req.user._id },
      });
    }

    const populatedInvitation = await populateInvitation(RoomInvitation.findById(invitation._id));
    const formattedInvitation = formatInvitation(populatedInvitation);
    const io = req.app.get("io");

    io
      ?.to(`user:${populatedInvitation.invitedBy._id.toString()}`)
      .emit("room-invitation-updated", formattedInvitation);

    await createActivityLog({
      io,
      actor: req.user._id,
      targetUser: populatedInvitation.invitedBy._id,
      room: populatedInvitation.room._id,
      action: status === "accepted" ? ACTIONS.INVITATION_ACCEPTED : ACTIONS.INVITATION_REJECTED,
      description: `${req.user.name} ${status} the invitation to ${populatedInvitation.room.name}`,
    });

    res.json(formattedInvitation);
  } catch (error) {
    res.status(500).json({ message: "Failed to update invitation", error: error.message });
  }
};

const markInvitationRead = async (req, res) => {
  try {
    const invitation = await RoomInvitation.findById(req.params.id);

    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found." });
    }

    const userId = req.user._id.toString();
    const isInvitedUser = invitation.invitedUser.toString() === userId;
    const isInviter = invitation.invitedBy.toString() === userId;

    if (!isInvitedUser && !isInviter) {
      return res.status(403).json({ message: "You can only read your own notifications." });
    }

    if (isInvitedUser) {
      invitation.invitedUserRead = true;
    }

    if (isInviter) {
      invitation.inviterRead = true;
    }

    await invitation.save();

    const populatedInvitation = await populateInvitation(RoomInvitation.findById(invitation._id));

    res.json(formatInvitation(populatedInvitation));
  } catch (error) {
    res.status(500).json({ message: "Failed to mark notification read", error: error.message });
  }
};

module.exports = {
  createInvitation,
  getMyInvitations,
  getRoomInvitations,
  markInvitationRead,
  updateInvitation,
};
