const ActivityLog = require("../models/ActivityLog");

const ACTIONS = {
  USER_LOGIN: "USER_LOGIN",
  ROOM_CREATED: "ROOM_CREATED",
  ROOM_DELETED: "ROOM_DELETED",
  ROOM_JOINED: "ROOM_JOINED",
  ROOM_LEFT: "ROOM_LEFT",
  INVITATION_SENT: "INVITATION_SENT",
  INVITATION_ACCEPTED: "INVITATION_ACCEPTED",
  INVITATION_REJECTED: "INVITATION_REJECTED",
  MEETING_STARTED: "MEETING_STARTED",
  MEETING_ENDED: "MEETING_ENDED",
  USER_MUTED: "USER_MUTED",
  USER_UNMUTED: "USER_UNMUTED",
  USER_KICKED: "USER_KICKED",
  SCREEN_SHARE_BLOCKED: "SCREEN_SHARE_BLOCKED",
  SCREEN_SHARE_ALLOWED: "SCREEN_SHARE_ALLOWED",
  USER_ROLE_UPDATED: "USER_ROLE_UPDATED",
};

const formatUser = (user) =>
  user
    ? {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
      }
    : null;

const formatRoom = (room) =>
  room
    ? {
        id: room._id.toString(),
        name: room.name,
      }
    : null;

const formatMeeting = (meeting) => {
  if (!meeting) {
    return null;
  }

  const durationEnd = meeting.endedAt || new Date();
  const durationMs = meeting.startedAt ? durationEnd.getTime() - meeting.startedAt.getTime() : 0;

  return {
    id: meeting._id.toString(),
    status: meeting.status,
    startedAt: meeting.startedAt,
    endedAt: meeting.endedAt,
    durationMs: Math.max(durationMs, 0),
    durationSeconds: Math.max(Math.floor(durationMs / 1000), 0),
    participantCount: meeting.participants?.length || 0,
  };
};

const populateActivity = (query) =>
  query
    .populate("actor", "name email role")
    .populate("targetUser", "name email role")
    .populate("room", "name")
    .populate("meeting", "status startedAt endedAt participants");

const formatActivity = (activity) => ({
  id: activity._id.toString(),
  actor: formatUser(activity.actor),
  user: formatUser(activity.actor),
  targetUser: formatUser(activity.targetUser),
  room: formatRoom(activity.room),
  meeting: formatMeeting(activity.meeting),
  action: activity.action,
  description: activity.description,
  details: activity.description,
  timestamp: activity.timestamp || activity.createdAt,
  createdAt: activity.createdAt,
});

const emitActivity = (io, activity) => {
  if (!io || !activity) return;

  const formattedActivity = formatActivity(activity);
  const rooms = new Set();

  rooms.add("activity:all");

  if (activity.actor?._id) {
    rooms.add(`activity:user:${activity.actor._id.toString()}`);
  }

  if (activity.targetUser?._id) {
    rooms.add(`activity:user:${activity.targetUser._id.toString()}`);
  }

  if (activity.room?._id) {
    rooms.add(`activity:room:${activity.room._id.toString()}`);
  }

  if (activity.meeting?._id) {
    rooms.add(`activity:meeting:${activity.meeting._id.toString()}`);
  }

  rooms.forEach((room) => {
    io.to(room).emit("activity-created", formattedActivity);
  });
};

const createActivityLog = async ({
  io,
  actor,
  targetUser = null,
  room = null,
  meeting = null,
  action,
  description,
}) => {
  const activity = await ActivityLog.create({
    actor,
    targetUser,
    room,
    meeting,
    action,
    description,
    timestamp: new Date(),
  });

  const populatedActivity = await populateActivity(ActivityLog.findById(activity._id));
  emitActivity(io, populatedActivity);

  return populatedActivity;
};

module.exports = {
  ACTIONS,
  createActivityLog,
  formatActivity,
  populateActivity,
};
