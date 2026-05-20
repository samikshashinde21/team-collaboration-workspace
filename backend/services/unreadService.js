const UnreadCount = require("../models/UnreadCount");
const User = require("../models/User");

const normalizeId = (value) => (value?._id || value)?.toString();

const emitUnreadCounts = async (io, userId) => {
  if (!io || !userId) return;

  const counts = await getUnreadCounts(userId);
  io.to(`user:${userId.toString()}`).emit("unread-counts-updated", counts);
};

const getUnreadCounts = async (userId) => {
  const rows = await UnreadCount.find({ user: userId, count: { $gt: 0 } });
  const rooms = {};
  const meetings = {};

  rows.forEach((row) => {
    const roomId = row.room.toString();

    if (row.meeting) {
      meetings[row.meeting.toString()] = row.count;
      return;
    }

    rooms[roomId] = row.count;
  });

  return {
    rooms,
    meetings,
    total:
      Object.values(rooms).reduce((sum, count) => sum + count, 0) +
      Object.values(meetings).reduce((sum, count) => sum + count, 0),
  };
};

const getRoomRecipientIds = async (room, senderId) => {
  const sender = senderId.toString();
  const ids = new Set();

  if ((room.isOpenToEveryone ?? !room.isPrivate) && !room.isLocked) {
    const users = await User.find({ _id: { $ne: senderId } }).select("_id");
    users.forEach((user) => ids.add(user._id.toString()));
  } else {
    [...(room.members || []), ...(room.assignedUsers || [])].forEach((userId) => {
      const id = normalizeId(userId);
      if (id && id !== sender) ids.add(id);
    });

    const staff = await User.find({ role: { $in: ["admin", "moderator"] }, _id: { $ne: senderId } }).select("_id");
    staff.forEach((user) => ids.add(user._id.toString()));
  }

  return Array.from(ids);
};

const incrementUnreadForUsers = async ({ io, userIds, roomId, meetingId = null }) => {
  if (!userIds.length) return;

  await UnreadCount.bulkWrite(
    userIds.map((userId) => ({
      updateOne: {
        filter: { user: userId, room: roomId, meeting: meetingId },
        update: { $inc: { count: 1 } },
        upsert: true,
      },
    }))
  );

  await Promise.all(userIds.map((userId) => emitUnreadCounts(io, userId)));
};

const clearUnread = async ({ io, userId, roomId, meetingId = null }) => {
  await UnreadCount.updateOne(
    { user: userId, room: roomId, meeting: meetingId },
    { $set: { count: 0 } },
    { upsert: true }
  );

  await emitUnreadCounts(io, userId);
};

module.exports = {
  clearUnread,
  emitUnreadCounts,
  getRoomRecipientIds,
  getUnreadCounts,
  incrementUnreadForUsers,
};
