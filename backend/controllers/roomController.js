const mongoose = require("mongoose");
const Room = require("../models/Room");
const RoomInvitation = require("../models/RoomInvitation");
const Meeting = require("../models/Meeting");
const User = require("../models/User");
const { clearRoomActivity, getRoomActivity } = require("./activityController");
const { canAccessRoom, validateRoomPermissions } = require("../services/roomAccess");
const { ACTIONS, createActivityLog } = require("../services/activityLogger");
const { onlineUsersByRoom } = require("../services/presenceStore");
const { createNotifications } = require("../services/notificationService");

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


const formatMeeting = (meeting) => {
  const participants = meeting.participants || [];
  const durationEnd = meeting.endedAt || new Date();
  const durationMs =
    meeting.status !== "scheduled" && meeting.startedAt
      ? durationEnd.getTime() - meeting.startedAt.getTime()
      : 0;

  return {
    id: meeting._id.toString(),
    room: meeting.room?._id?.toString?.() || meeting.room?.toString?.(),
    title: meeting.title || "Room meeting",
    description: meeting.description || "",
    status: meeting.status,
    startedBy: meeting.startedBy
      ? {
          id: meeting.startedBy._id.toString(),
          name: meeting.startedBy.name,
          email: meeting.startedBy.email,
          role: meeting.startedBy.role,
        }
      : null,
    scheduledBy: meeting.scheduledBy
      ? {
          id: meeting.scheduledBy._id.toString(),
          name: meeting.scheduledBy.name,
          email: meeting.scheduledBy.email,
          role: meeting.scheduledBy.role,
        }
      : null,
    participants: participants.map((participant) => ({
      user: participant.user
        ? {
            id: participant.user._id.toString(),
            name: participant.user.name,
            email: participant.user.email,
            role: participant.user.role,
          }
        : null,
      joinedAt: participant.joinedAt,
      leftAt: participant.leftAt,
    })),
    participantCount: participants.length,
    activeParticipantCount: participants.filter((participant) => !participant.leftAt).length,
    durationMs: Math.max(durationMs, 0),
    durationSeconds: Math.max(Math.floor(durationMs / 1000), 0),
    scheduledFor: meeting.scheduledFor,
    startedAt: meeting.startedAt,
    endedAt: meeting.endedAt,
    createdAt: meeting.createdAt,
    updatedAt: meeting.updatedAt,
  };
};

const populateMeeting = (query) =>
  query
    .populate("startedBy", "name email role")
    .populate("scheduledBy", "name email role")
    .populate("participants.user", "name email role");

const findAccessibleRoom = async (req, roomId) => {
  if (!mongoose.Types.ObjectId.isValid(roomId)) {
    return { error: { status: 400, message: "Valid room id is required." } };
  }

  const room = await Room.findById(roomId)
    .populate("members", "name email role")
    .populate("assignedUsers", "name email role")
    .populate("removedUsers", "name email role");

  if (!room) {
    return { error: { status: 404, message: "Room not found" } };
  }

  const access = canAccessRoom(req.user, room);

  if (!access.allowed) {
    return { error: { status: 403, message: access.message } };
  }

  return { room };
};

const emitRoomMeetingUpdate = (io, room, event, meeting) => {
  if (!io || !room || !meeting) return;

  const formattedMeeting = formatMeeting(meeting);
  const roomId = room._id.toString();

  io.to(roomId).emit(event, {
    roomId,
    meeting: formattedMeeting,
  });

  (room.members || []).forEach((member) => {
    const memberId = (member._id || member).toString();
    io.to(`user:${memberId}`).emit(event, {
      roomId,
      meeting: formattedMeeting,
    });
  });
};

const scheduleMeetingReminder = (io, room, meeting) => {
  if (!io || !room || !meeting?.scheduledFor) return;

  const reminderDelay = new Date(meeting.scheduledFor).getTime() - Date.now() - 10 * 60 * 1000;
  const timer = setTimeout(async () => {
    const currentMeeting = await populateMeeting(Meeting.findById(meeting._id));

    if (!currentMeeting || currentMeeting.status !== "scheduled") return;

    const formattedMeeting = formatMeeting(currentMeeting);
    const roomId = room._id.toString();

    (room.members || []).forEach((member) => {
      io.to(`user:${(member._id || member).toString()}`).emit("room-meeting-reminder", {
        roomId,
        meeting: formattedMeeting,
      });
    });
    await createNotifications({
      io,
      recipients: room.members || [],
      type: "MEETING_STARTING_SOON",
      title: `${currentMeeting.title || "Meeting"} starts in 10 minutes`,
      message: "Please join on time.",
      room: room._id,
      meeting: currentMeeting._id,
    });
  }, Math.max(reminderDelay, 0));

  timer.unref?.();
};
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

    await createActivityLog({
      io: req.app.get("io"),
      actor: req.user._id,
      room: room._id,
      action: ACTIONS.ROOM_CREATED,
      description: `${req.user.name} created room ${room.name}`,
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

        createActivityLog({
          io,
          actor: req.user._id,
          targetUser: invitation.invitedUser._id,
          room: room._id,
          action: ACTIONS.INVITATION_SENT,
          description: `${req.user.name} invited ${invitation.invitedUser.name} to ${room.name}`,
        }).catch(() => {});
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
      .populate("removedUsers", "name email role")
      .populate("assignedUsers", "name email role")
      .sort({ createdAt: -1 });

    const accessibleRooms = rooms.filter((room) => canAccessRoom(req.user, room).allowed);
    const activeMeetings = await populateMeeting(
      Meeting.find({ room: { $in: accessibleRooms.map((room) => room._id) }, status: "active" })
    );
    const activeMeetingByRoomId = new Map(
      activeMeetings.map((meeting) => [meeting.room.toString(), formatMeeting(meeting)])
    );

    res.json(
      accessibleRooms.map((room) => ({
        ...room.toObject(),
        activeMeeting: activeMeetingByRoomId.get(room._id.toString()) || null,
        onlineParticipantsCount: new Set(
          Array.from(onlineUsersByRoom.get(room._id.toString())?.values() || []).map((onlineUser) => onlineUser.id)
        ).size,
      }))
    );
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch rooms", error: error.message });
  }
};

const getRoomById = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id)
      .populate("createdBy", "name email role")
      .populate("members", "name email role")
      .populate("removedUsers", "name email role")
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

    await createActivityLog({
      io: req.app.get("io"),
      actor: req.user._id,
      room: room._id,
      action: ACTIONS.ROOM_DELETED,
      description: `${req.user.name} deleted room ${room.name}`,
    });

    await room.deleteOne();

    res.json({ message: "Room deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete room", error: error.message });
  }
};


const getRoomMeetings = async (req, res) => {
  try {
    const { room, error } = await findAccessibleRoom(req, req.params.id);

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const meetings = await populateMeeting(
      Meeting.find({ room: room._id }).sort({ startedAt: -1 })
    );

    res.json(meetings.map(formatMeeting));
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch meetings", error: error.message });
  }
};

const startMeeting = async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "moderator") {
      return res.status(403).json({ message: "Only admins and moderators can start meetings." });
    }

    const { room, error } = await findAccessibleRoom(req, req.params.id);

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const activeMeeting = await populateMeeting(
      Meeting.findOne({ room: room._id, status: "active" })
    );

    if (activeMeeting) {
      return res.status(409).json({
        message: "A meeting is already active in this room.",
        meeting: formatMeeting(activeMeeting),
      });
    }

    const startedAt = new Date();
    const { scheduledMeetingId } = req.body;
    let meeting;

    if (scheduledMeetingId) {
      if (!mongoose.Types.ObjectId.isValid(scheduledMeetingId)) {
        return res.status(400).json({ message: "Valid scheduled meeting id is required." });
      }

      meeting = await Meeting.findOneAndUpdate(
        { _id: scheduledMeetingId, room: room._id, status: "scheduled" },
        {
          status: "active",
          startedBy: req.user._id,
          startedAt,
          $addToSet: { participants: { user: req.user._id, joinedAt: startedAt } },
        },
        { new: true }
      );

      if (!meeting) {
        return res.status(404).json({ message: "Scheduled meeting not found." });
      }
    } else {
      meeting = await Meeting.create({
        room: room._id,
        title: req.body.title?.trim() || "Room meeting",
        description: req.body.description?.trim() || "",
        status: "active",
        startedBy: req.user._id,
        participants: [{ user: req.user._id, joinedAt: startedAt }],
        startedAt,
      });
    }

    const populatedMeeting = await populateMeeting(Meeting.findById(meeting._id));
    emitRoomMeetingUpdate(req.app.get("io"), room, "room-meeting-updated", populatedMeeting);

    createActivityLog({
      io: req.app.get("io"),
      actor: req.user._id,
      room: room._id,
      meeting: meeting._id,
      action: ACTIONS.MEETING_STARTED,
      description: `${req.user.name} started ${meeting.title || "a meeting"} in ${room.name}`,
    }).catch(() => {});
    createNotifications({
      io: req.app.get("io"),
      recipients: (room.members || []).filter((member) => member.toString() !== req.user._id.toString()),
      type: "MEETING_STARTED",
      title: `${meeting.title || "Meeting"} is now live`,
      message: `${req.user.name} started a meeting in ${room.name}.`,
      room: room._id,
      meeting: meeting._id,
    }).catch(() => {});

    res.status(201).json(formatMeeting(populatedMeeting));
  } catch (error) {
    res.status(500).json({ message: "Failed to start meeting", error: error.message });
  }
};

const scheduleMeeting = async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "moderator") {
      return res.status(403).json({ message: "Only admins and moderators can schedule meetings." });
    }

    const { room, error } = await findAccessibleRoom(req, req.params.id);

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const { title, date, time, description = "" } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({ message: "Meeting title is required." });
    }

    if (!date || !time) {
      return res.status(400).json({ message: "Meeting date and time are required." });
    }

    const scheduledFor = new Date(`${date}T${time}`);

    if (Number.isNaN(scheduledFor.getTime())) {
      return res.status(400).json({ message: "Valid meeting date and time are required." });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const scheduledDay = new Date(scheduledFor);
    scheduledDay.setHours(0, 0, 0, 0);

    if (scheduledDay < today) {
      return res.status(400).json({ message: "Meetings can only be scheduled from today onward." });
    }

    const meeting = await Meeting.create({
      room: room._id,
      title: title.trim(),
      description: description.trim(),
      status: "scheduled",
      scheduledBy: req.user._id,
      scheduledFor,
      participants: [],
    });

    const populatedMeeting = await populateMeeting(Meeting.findById(meeting._id));
    emitRoomMeetingUpdate(req.app.get("io"), room, "room-meeting-scheduled", populatedMeeting);
    scheduleMeetingReminder(req.app.get("io"), room, populatedMeeting);

    res.status(201).json(formatMeeting(populatedMeeting));
  } catch (error) {
    res.status(500).json({ message: "Failed to schedule meeting", error: error.message });
  }
};

const getMeetingById = async (req, res) => {
  try {
    const { room, error } = await findAccessibleRoom(req, req.params.id);

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const meeting = await populateMeeting(
      Meeting.findOne({ _id: req.params.meetingId, room: room._id })
    );

    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }

    res.json(formatMeeting(meeting));
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch meeting", error: error.message });
  }
};

const endMeeting = async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "moderator") {
      return res.status(403).json({ message: "Only admins and moderators can end meetings." });
    }

    const { room, error } = await findAccessibleRoom(req, req.params.id);

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const meeting = await populateMeeting(
      Meeting.findOneAndUpdate(
        { _id: req.params.meetingId, room: room._id },
        {
          status: "ended",
          endedAt: new Date(),
          $set: { "participants.$[participant].leftAt": new Date() },
        },
        {
          new: true,
          arrayFilters: [{ "participant.leftAt": null }],
        }
      )
    );

    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }

    req.app.get("io")?.to(`meeting:${meeting._id.toString()}`).emit("meeting-ended", {
      roomId: room._id.toString(),
      meetingId: meeting._id.toString(),
      meeting: formatMeeting(meeting),
    });
    emitRoomMeetingUpdate(req.app.get("io"), room, "room-meeting-updated", meeting);

    await createActivityLog({
      io: req.app.get("io"),
      actor: req.user._id,
      room: room._id,
      meeting: meeting._id,
      action: ACTIONS.MEETING_ENDED,
      description: `${req.user.name} ended a meeting in ${room.name}`,
    });

    res.json(formatMeeting(meeting));
  } catch (error) {
    res.status(500).json({ message: "Failed to end meeting", error: error.message });
  }
};

const deleteMeeting = async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "moderator") {
      return res.status(403).json({ message: "Only admins and moderators can delete meetings." });
    }

    const { room, error } = await findAccessibleRoom(req, req.params.id);

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const meeting = await Meeting.findOne({ _id: req.params.meetingId, room: room._id });

    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }

    await meeting.deleteOne();

    const roomId = room._id.toString();
    const meetingId = req.params.meetingId;

    req.app.get("io")?.to(roomId).emit("room-meeting-deleted", { roomId, meetingId });
    (room.members || []).forEach((member) => {
      req.app.get("io")?.to(`user:${(member._id || member).toString()}`).emit("room-meeting-deleted", {
        roomId,
        meetingId,
      });
    });

    res.json({ message: "Meeting deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete meeting", error: error.message });
  }
};
module.exports = {
  clearRoomActivity,
  createRoom,
  deleteMeeting,
  getRooms,
  getRoomById,
  deleteRoom,
  getRoomActivity,
  getRoomMeetings,
  scheduleMeeting,
  startMeeting,
  getMeetingById,
  endMeeting,
};
