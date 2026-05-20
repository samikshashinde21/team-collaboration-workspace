const jwt = require("jsonwebtoken");
const Message = require("../models/Message");
const Meeting = require("../models/Meeting");
const Room = require("../models/Room");
const RoomInvitation = require("../models/RoomInvitation");
const User = require("../models/User");
const { ACTIONS, createActivityLog } = require("../services/activityLogger");
const { createNotification } = require("../services/notificationService");
const { onlineUsersByRoom, callUsersByRoom } = require("../services/presenceStore");
const { canAccessRoom } = require("../services/roomAccess");
const {
  clearUnread,
  getRoomRecipientIds,
  getUnreadCounts,
  incrementUnreadForUsers,
} = require("../services/unreadService");

const formatUser = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  avatarUrl: user.avatarUrl || "",
});

const formatMessage = (message) => ({
  id: message._id.toString(),
  room: message.room.toString(),
  content: message.content,
  sender: formatUser(message.sender),
  createdAt: message.createdAt,
});

const formatMeetingMessage = (message) => ({
  id: message.id,
  room: message.room.toString(),
  meeting: message.meeting.toString(),
  content: message.content,
  sender: message.sender,
  createdAt: message.createdAt,
});

const meetingMessagesByChannel = new Map();

const getTemporaryMeetingMessages = (channel) => meetingMessagesByChannel.get(channel) || [];

const addTemporaryMeetingMessage = ({ channel, roomId, meetingId, sender, content }) => {
  const message = {
    id: `${Date.now()}-${sender.id}-${Math.random().toString(36).slice(2, 8)}`,
    room: roomId,
    meeting: meetingId,
    content,
    sender,
    createdAt: new Date().toISOString(),
  };
  const messages = [...getTemporaryMeetingMessages(channel), message].slice(-100);
  meetingMessagesByChannel.set(channel, messages);
  return message;
};

const formatMeetingForRoom = (meeting) => {
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
          avatarUrl: meeting.startedBy.avatarUrl || "",
        }
      : null,
    scheduledBy: meeting.scheduledBy
      ? {
          id: meeting.scheduledBy._id.toString(),
          name: meeting.scheduledBy.name,
          email: meeting.scheduledBy.email,
          role: meeting.scheduledBy.role,
          avatarUrl: meeting.scheduledBy.avatarUrl || "",
        }
      : null,
    participants: participants.map((participant) => ({
      user: participant.user
        ? {
            id: participant.user._id.toString(),
            name: participant.user.name,
            email: participant.user.email,
            role: participant.user.role,
            avatarUrl: participant.user.avatarUrl || "",
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

const populateMeetingForRoomUpdate = (query) =>
  query
    .populate("startedBy", "name email role avatarUrl")
    .populate("scheduledBy", "name email role avatarUrl")
    .populate("participants.user", "name email role avatarUrl");

const getOnlineUsers = (roomId) => {
  const users = onlineUsersByRoom.get(roomId);

  if (!users) {
    return [];
  }

  return Array.from(
    new Map(Array.from(users.values()).map((user) => [user.id, user])).values()
  );
};

const getOnlineUserIds = (roomId) => new Set(getOnlineUsers(roomId).map((user) => user.id));

const getActiveRoomViewerIds = (roomId) => getOnlineUserIds(roomId);

const formatParticipant = (user, onlineUserIds) => {
  const formattedUser = formatUser(user);

  return {
    ...formattedUser,
    status: onlineUserIds.has(formattedUser.id) ? "online" : "offline",
  };
};

const emitOnlineUsers = (io, roomId) => {
  io.to(roomId).emit("online-users", {
    roomId,
    users: getOnlineUsers(roomId),
  });
};

const findRoomForAccess = (roomId) =>
  Room.findById(roomId)
    .populate("members", "name email role")
    .populate("assignedUsers", "name email role")
    .populate("removedUsers", "name email role")
    .populate("mutedUsers", "name email role")
    .populate("screenShareBlocked", "name email role");

const emitRoomParticipants = async (io, roomId, room = null) => {
  const populatedRoom =
    room || (await Room.findById(roomId).populate("members", "name email role"));

  if (!populatedRoom) {
    return;
  }

  const onlineUserIds = getOnlineUserIds(roomId);

  // build participant list with moderation state
  const mutedSet = new Set((populatedRoom.mutedUsers || []).map((u) => (u._id || u).toString()));
  const screenBlockedSet = new Set((populatedRoom.screenShareBlocked || []).map((u) => (u._id || u).toString()));

  io.to(roomId).emit("room-participants", {
    roomId,
    participants: populatedRoom.members.map((member) => ({
      ...formatParticipant(member, onlineUserIds),
      muted: mutedSet.has((member._id || member).toString()),
      screenShareBlocked: screenBlockedSet.has((member._id || member).toString()),
    })),
  });
};

const isModeratorOrAdmin = (user) => user && (user.role === "admin" || user.role === "moderator");

const logActivity = (io, payload) => {
  createActivityLog({ io, ...payload }).catch(() => {});
};

const removeUserSocketsFromRoom = (io, roomId, targetUserId) => {
  const roomUsers = onlineUsersByRoom.get(roomId);

  if (!roomUsers) return;

  for (const [socketId, user] of roomUsers.entries()) {
    if (user.id === targetUserId) {
      const sock = io.sockets.sockets.get(socketId);
      if (sock) {
        sock.leave(roomId);
        sock.joinedRooms && sock.joinedRooms.delete(roomId);
        // notify the kicked socket directly
        sock.emit("kicked", { roomId, message: "You were removed from the room by a moderator." });
      }
      roomUsers.delete(socketId);
    }
  }

  if (roomUsers.size === 0) {
    onlineUsersByRoom.delete(roomId);
  }
};

const removeSocketFromRoom = async (io, socket, roomId) => {
  const roomUsers = onlineUsersByRoom.get(roomId);

  if (!roomUsers) {
    socket.leave(roomId);
    return;
  }

  roomUsers.delete(socket.id);

  if (roomUsers.size === 0) {
    onlineUsersByRoom.delete(roomId);
  }

  socket.leave(roomId);
  emitOnlineUsers(io, roomId);
  await emitRoomParticipants(io, roomId);
};

const getCallChannel = (roomId, meetingId = null) => (meetingId ? `meeting:${meetingId}` : roomId);

const getCallUsers = (channel) => {
  const users = callUsersByRoom.get(channel);

  return users ? Array.from(users.values()) : [];
};

const sortPresenterFirst = (users) =>
  [...users].sort((a, b) => Number(Boolean(b.screenSharing)) - Number(Boolean(a.screenSharing)));

const emitCallParticipants = (io, channel, roomId, meetingId) => {
  io.to(channel).emit("meeting-participants", {
    roomId,
    meetingId,
    users: sortPresenterFirst(getCallUsers(channel)),
  });
};

const canModerateMeeting = async (moderator, roomId, meetingId) => {
  if (!isModeratorOrAdmin(moderator)) {
    return { allowed: false, message: "Insufficient permissions" };
  }

  const [room, meeting] = await Promise.all([
    findRoomForAccess(roomId),
    Meeting.findOne({ _id: meetingId, room: roomId, status: "active" }),
  ]);

  if (!room) {
    return { allowed: false, message: "Room not found" };
  }

  const access = canAccessRoom(moderator, room);

  if (!access.allowed) {
    return { allowed: false, message: access.message };
  }

  if (!meeting) {
    return { allowed: false, message: "Meeting not found or ended" };
  }

  return { allowed: true, room, meeting };
};

const getTargetCallEntries = (channel, targetUserId) => {
  const callUsers = callUsersByRoom.get(channel);

  if (!callUsers) return [];

  return Array.from(callUsers.entries()).filter(([, callUser]) => callUser.id === targetUserId);
};

const updateTargetCallState = (channel, targetUserId, nextState) => {
  const callUsers = callUsersByRoom.get(channel);

  if (!callUsers) return [];

  const updatedUsers = [];

  for (const [socketId, callUser] of callUsers.entries()) {
    if (callUser.id !== targetUserId) continue;

    const updatedUser = { ...callUser, ...nextState, live: true };
    callUsers.set(socketId, updatedUser);
    updatedUsers.push(updatedUser);
  }

  return updatedUsers;
};

const emitRoomMeetingUpdate = async (io, roomId, meetingId) => {
  if (!io || !roomId || !meetingId) return;

  const [room, meeting] = await Promise.all([
    Room.findById(roomId).select("members"),
    populateMeetingForRoomUpdate(Meeting.findById(meetingId)),
  ]);

  if (!room || !meeting) return;

  const formattedMeeting = formatMeetingForRoom(meeting);
  const formattedRoomId = room._id.toString();

  io.to(formattedRoomId).emit("room-meeting-updated", {
    roomId: formattedRoomId,
    meeting: formattedMeeting,
  });

  (room.members || []).forEach((member) => {
    io.to(`user:${(member._id || member).toString()}`).emit("room-meeting-updated", {
      roomId: formattedRoomId,
      meeting: formattedMeeting,
    });
  });
};

const addMeetingParticipant = async (meetingId, userId) => {
  if (!meetingId) return;

  const meeting = await Meeting.findById(meetingId).select("participants status");

  if (!meeting || meeting.status !== "active") return;

  const existingParticipant = meeting.participants.find(
    (participant) => participant.user.toString() === userId.toString()
  );

  if (existingParticipant) {
    existingParticipant.leftAt = null;
  } else {
    meeting.participants.push({ user: userId, joinedAt: new Date() });
  }

  await meeting.save();
};

const markMeetingParticipantLeft = async (meetingId, userId) => {
  if (!meetingId) return;

  await Meeting.updateOne(
    { _id: meetingId, "participants.user": userId, "participants.leftAt": null },
    { $set: { "participants.$.leftAt": new Date() } }
  );
};

const removeSocketFromCall = async (io, socket, callRoom) => {
  const normalizedCallRoom =
    typeof callRoom === "string" ? { channel: callRoom, roomId: callRoom, meetingId: null } : callRoom;
  const { channel, roomId, meetingId } = normalizedCallRoom;
  const callUsers = callUsersByRoom.get(channel);

  if (!callUsers) {
    return;
  }

  const removedUser = callUsers.get(socket.id);
  callUsers.delete(socket.id);

  if (meetingId) {
    const stillPresent = Array.from(callUsers.values()).some((user) => user.id === socket.user._id.toString());

    if (!stillPresent) {
      await markMeetingParticipantLeft(meetingId, socket.user._id);
      await emitRoomMeetingUpdate(io, roomId, meetingId);
    }
  }

  if (callUsers.size === 0) {
    callUsersByRoom.delete(channel);
    if (meetingId) {
      meetingMessagesByChannel.delete(channel);
    }
  }

  socket.leave(channel);
  socket.to(channel).emit("call-user-left", {
    roomId,
    meetingId,
    socketId: socket.id,
    user: removedUser || formatUser(socket.user),
    users: sortPresenterFirst(getCallUsers(channel)),
  });
  emitCallParticipants(io, channel, roomId, meetingId);
};
const socketHandler = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("Authentication token is required"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("-password");

      if (!user) {
        return next(new Error("User not found"));
      }

      socket.user = user;
      socket.joinedRooms = new Set();
      socket.callRooms = new Set();
      socket.join(`user:${user._id.toString()}`);
      next();
    } catch (error) {
      next(new Error("Socket authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    getUnreadCounts(socket.user._id)
      .then((counts) => socket.emit("unread-counts-updated", counts))
      .catch(() => {});

    socket.on("join-room", async ({ roomId }, callback) => {
      try {
        if (!roomId) {
          return callback?.({ ok: false, message: "Room ID is required" });
        }

        const existingRoom = await findRoomForAccess(roomId);

        if (!existingRoom) {
          return callback?.({ ok: false, message: "Room not found" });
        }

        const access = canAccessRoom(socket.user, existingRoom);

        if (!access.allowed) {
          return callback?.({ ok: false, message: access.message });
        }

        const room = await Room.findByIdAndUpdate(
          roomId,
          { $addToSet: { members: socket.user._id } },
          { new: true }
        )
          .populate("members", "name email role")
          .populate("assignedUsers", "name email role");

        socket.join(roomId);
        socket.joinedRooms.add(roomId);

        if (!onlineUsersByRoom.has(roomId)) {
          onlineUsersByRoom.set(roomId, new Map());
        }

        onlineUsersByRoom.get(roomId).set(socket.id, formatUser(socket.user));

        const messages = await Message.find({ room: roomId })
          .sort({ createdAt: 1 })
          .limit(50)
          .populate("sender", "name email role");

        socket.emit("room-messages", messages.map(formatMessage));
        emitOnlineUsers(io, roomId);
        await emitRoomParticipants(io, roomId, room);
        await clearUnread({ io, userId: socket.user._id, roomId });
        socket.join(`activity:room:${roomId}`);
        logActivity(io, {
          actor: socket.user._id,
          room: roomId,
          action: ACTIONS.ROOM_JOINED,
          description: `${socket.user.name} joined ${room.name}`,
        });

        callback?.({ ok: true });
      } catch (error) {
        callback?.({ ok: false, message: "Could not join room" });
      }
    });

    socket.on("leave-room", async ({ roomId }) => {
      if (!roomId) {
        return;
      }

      await removeSocketFromRoom(io, socket, roomId);
      const room = await Room.findById(roomId).select("name");
      if (room) {
        logActivity(io, {
          actor: socket.user._id,
          room: roomId,
          action: ACTIONS.ROOM_LEFT,
          description: `${socket.user.name} left ${room.name}`,
        });
      }
      socket.joinedRooms.delete(roomId);
      socket.leave(`activity:room:${roomId}`);
      socket.to(roomId).emit("typing-stop", {
        roomId,
        scope: "room",
        user: formatUser(socket.user),
      });
      socket.to(roomId).emit("stop-typing", {
        roomId,
        user: formatUser(socket.user),
      });
    });

    socket.on("message", async ({ roomId, content }, callback) => {
      try {
        const trimmedContent = content?.trim();

        if (!roomId || !trimmedContent) {
          return callback?.({ ok: false, message: "Room and message are required" });
        }

        const room = await findRoomForAccess(roomId);

        if (!room) {
          return callback?.({ ok: false, message: "Room not found" });
        }

        const access = canAccessRoom(socket.user, room);

        if (!access.allowed) {
          return callback?.({ ok: false, message: access.message });
        }

        // check if sender is muted in this room
        const isMuted = (room.mutedUsers || []).some(
          (m) => (m._id || m).toString() === socket.user._id.toString()
        );

        if (isMuted) {
          return callback?.({ ok: false, message: "You have been muted by a moderator." });
        }

        const message = await Message.create({
          room: roomId,
          sender: socket.user._id,
          content: trimmedContent,
        });

        const savedMessage = await message.populate("sender", "name email role");
        const formattedMessage = formatMessage(savedMessage);
        const activeViewerIds = getActiveRoomViewerIds(roomId);
        const recipientIds = (await getRoomRecipientIds(room, socket.user._id)).filter(
          (userId) => !activeViewerIds.has(userId)
        );

        io.to(roomId).emit("message", formattedMessage);
        await incrementUnreadForUsers({ io, userIds: recipientIds, roomId });
        socket.to(roomId).emit("typing-stop", {
          roomId,
          scope: "room",
          user: formatUser(socket.user),
        });
        socket.to(roomId).emit("stop-typing", {
          roomId,
          user: formatUser(socket.user),
        });

        callback?.({ ok: true, message: formattedMessage });
      } catch (error) {
        callback?.({ ok: false, message: "Could not send message" });
      }
    });


    socket.on("meeting-message", async ({ roomId, meetingId, content }, callback) => {
      try {
        const trimmedContent = content?.trim();

        if (!roomId || !meetingId || !trimmedContent) {
          return callback?.({ ok: false, message: "Meeting and message are required" });
        }

        const room = await findRoomForAccess(roomId);

        if (!room) {
          return callback?.({ ok: false, message: "Room not found" });
        }

        const access = canAccessRoom(socket.user, room);

        if (!access.allowed) {
          return callback?.({ ok: false, message: access.message });
        }

        const meeting = await Meeting.findOne({ _id: meetingId, room: roomId, status: "active" });

        if (!meeting) {
          return callback?.({ ok: false, message: "Meeting not found or ended" });
        }

        const channel = getCallChannel(roomId, meetingId);
        const formattedMessage = addTemporaryMeetingMessage({
          channel,
          roomId,
          meetingId,
          sender: formatUser(socket.user),
          content: trimmedContent,
        });

        io.to(channel).emit("meeting-message", formattedMessage);
        socket.to(channel).emit("typing-stop", {
          roomId,
          meetingId,
          scope: "meeting",
          user: formatUser(socket.user),
        });
        callback?.({ ok: true, message: formattedMessage });
      } catch (error) {
        callback?.({ ok: false, message: "Could not send meeting message" });
      }
    });
    socket.on("typing", ({ roomId }) => {
      if (!roomId) {
        return;
      }

      if (!socket.rooms.has(roomId)) {
        return;
      }

      socket.to(roomId).emit("typing-start", {
        roomId,
        scope: "room",
        user: formatUser(socket.user),
      });
      socket.to(roomId).emit("typing", {
        roomId,
        user: formatUser(socket.user),
      });
    });

    socket.on("stop-typing", ({ roomId }) => {
      if (!roomId) {
        return;
      }

      if (!socket.rooms.has(roomId)) {
        return;
      }

      socket.to(roomId).emit("typing-stop", {
        roomId,
        scope: "room",
        user: formatUser(socket.user),
      });
      socket.to(roomId).emit("stop-typing", {
        roomId,
        user: formatUser(socket.user),
      });
    });

    socket.on("typing-start", ({ roomId, meetingId = null }) => {
      if (!roomId) return;

      const channel = meetingId ? getCallChannel(roomId, meetingId) : roomId;
      if (!socket.rooms.has(channel)) return;

      socket.to(channel).emit("typing-start", {
        roomId,
        meetingId,
        scope: meetingId ? "meeting" : "room",
        user: formatUser(socket.user),
      });
    });

    socket.on("typing-stop", ({ roomId, meetingId = null }) => {
      if (!roomId) return;

      const channel = meetingId ? getCallChannel(roomId, meetingId) : roomId;
      if (!socket.rooms.has(channel)) return;

      socket.to(channel).emit("typing-stop", {
        roomId,
        meetingId,
        scope: meetingId ? "meeting" : "room",
        user: formatUser(socket.user),
      });
    });

    const handleJoinMeetingCall = async ({ roomId, meetingId = null }, callback) => {
      if (!roomId) {
        return callback?.({ ok: false, message: "Room ID is required" });
      }

      let room;

      try {
        room = await findRoomForAccess(roomId);
      } catch {
        return callback?.({ ok: false, message: "Could not join call" });
      }

      if (!room) {
        return callback?.({ ok: false, message: "Room not found" });
      }

      const access = canAccessRoom(socket.user, room);

      if (!access.allowed) {
        return callback?.({ ok: false, message: access.message });
      }

      if (meetingId) {
        const meeting = await Meeting.findOne({ _id: meetingId, room: roomId });

        if (!meeting) {
          return callback?.({ ok: false, message: "Meeting not found" });
        }

        if (meeting.status !== "active") {
          return callback?.({ ok: false, message: "Meeting has ended" });
        }

        await addMeetingParticipant(meetingId, socket.user._id);
        await emitRoomMeetingUpdate(io, roomId, meetingId);
        await clearUnread({ io, userId: socket.user._id, roomId, meetingId });
      }

      const channel = getCallChannel(roomId, meetingId);
      socket.join(channel);
      const callRoom = { channel, roomId, meetingId };
      socket.callRooms.add(callRoom);

      if (!callUsersByRoom.has(channel)) {
        callUsersByRoom.set(channel, new Map());
      }

      const callUser = {
        socketId: socket.id,
        ...formatUser(socket.user),
        micOn: false,
        cameraOn: false,
        screenSharing: false,
        speaking: false,
        live: true,
      };
      const existingUsers = getCallUsers(channel);

      if (!meetingId && !callUsersByRoom.get(channel).has(socket.id) && existingUsers.length >= 2) {
        socket.leave(channel);
        socket.callRooms.delete(callRoom);
        return callback?.({ ok: false, message: "This call already has two participants" });
      }

      callUsersByRoom.get(channel).set(socket.id, callUser);

      if (meetingId) {
        socket.emit("meeting-messages", getTemporaryMeetingMessages(channel).map(formatMeetingMessage));
      }

      socket.to(channel).emit("call-user-joined", {
        roomId,
        meetingId,
        socketId: socket.id,
        user: callUser,
        users: sortPresenterFirst(getCallUsers(channel)),
      });

      socket.to(channel).emit("meeting-participants", {
        roomId,
        meetingId,
        users: sortPresenterFirst(getCallUsers(channel)),
      });

      callback?.({ ok: true, users: sortPresenterFirst(existingUsers) });
    };

    const handleLeaveMeetingCall = async ({ roomId, meetingId = null }) => {
      if (!roomId) {
        return;
      }

      const channel = getCallChannel(roomId, meetingId);
      for (const callRoom of Array.from(socket.callRooms)) {
        const callChannel = typeof callRoom === "string" ? callRoom : callRoom.channel;

        if (callChannel === channel) {
          await removeSocketFromCall(io, socket, callRoom);
          socket.callRooms.delete(callRoom);
          io.to(channel).emit("meeting-participants", {
            roomId,
            meetingId,
            users: sortPresenterFirst(getCallUsers(channel)),
          });
        }
      }
    };

    socket.on("join-call", handleJoinMeetingCall);
    socket.on("join-meeting", handleJoinMeetingCall);
    socket.on("leave-call", handleLeaveMeetingCall);
    socket.on("leave-meeting", handleLeaveMeetingCall);

    socket.on("meeting-media-state", ({ roomId, meetingId = null, micOn = false, cameraOn = false, screenSharing = false }) => {
      if (!roomId) return;

      const channel = getCallChannel(roomId, meetingId);
      const callUsers = callUsersByRoom.get(channel);

      if (!callUsers?.has(socket.id)) return;

      const updatedUser = {
        ...callUsers.get(socket.id),
        micOn: !!micOn,
        cameraOn: !!cameraOn,
        screenSharing: !!screenSharing,
        speaking: !!micOn && !!callUsers.get(socket.id).speaking,
        live: true,
      };

      if (updatedUser.screenSharing) {
        for (const [participantSocketId, participant] of callUsers.entries()) {
          if (participantSocketId !== socket.id && participant.screenSharing) {
            callUsers.set(participantSocketId, { ...participant, screenSharing: false });
          }
        }
      }

      callUsers.set(socket.id, updatedUser);
      io.to(channel).emit("meeting-participants", {
        roomId,
        meetingId,
        users: sortPresenterFirst(getCallUsers(channel)),
      });
    });

    socket.on("meeting-speaking-state", ({ roomId, meetingId = null, speaking = false }) => {
      if (!roomId) return;

      const channel = getCallChannel(roomId, meetingId);
      const callUsers = callUsersByRoom.get(channel);

      if (!callUsers?.has(socket.id)) return;

      const currentUser = callUsers.get(socket.id);
      const updatedUser = {
        ...currentUser,
        speaking: !!speaking && !!currentUser.micOn,
        live: true,
      };

      callUsers.set(socket.id, updatedUser);
      io.to(channel).emit("meeting-participants", {
        roomId,
        meetingId,
        users: sortPresenterFirst(getCallUsers(channel)),
      });
    });

    socket.on("meeting-moderation-action", async ({ roomId, meetingId, targetUserId, action }, callback) => {
      try {
        if (!roomId || !meetingId || !targetUserId || !action) {
          return callback?.({ ok: false, message: "Meeting, participant, and action are required" });
        }

        const permission = await canModerateMeeting(socket.user, roomId, meetingId);

        if (!permission.allowed) {
          return callback?.({ ok: false, message: permission.message });
        }

        const moderator = formatUser(socket.user);
        const targetUser = await User.findById(targetUserId).select("name email role");

        if (!targetUser) {
          return callback?.({ ok: false, message: "Participant not found" });
        }

        if (targetUser._id.toString() === socket.user._id.toString()) {
          return callback?.({ ok: false, message: "You cannot moderate yourself" });
        }

        if (targetUser.role === "admin" && socket.user.role !== "admin") {
          return callback?.({ ok: false, message: "Cannot moderate an admin" });
        }

        const channel = getCallChannel(roomId, meetingId);
        const targetEntries = getTargetCallEntries(channel, targetUserId);

        if (!targetEntries.length) {
          return callback?.({ ok: false, message: "Participant is no longer in the meeting" });
        }

        const target = formatUser(targetUser);
        const actionMessages = {
          mute: `${moderator.name} muted your microphone`,
          cameraOff: `${moderator.name} turned off your camera`,
          stopScreenShare: `${moderator.name} stopped your screen sharing`,
          remove: "You were removed from the meeting",
        };
        const confirmationMessages = {
          mute: `${target.name}'s microphone was muted`,
          cameraOff: `${target.name}'s camera was turned off`,
          stopScreenShare: `${target.name}'s screen sharing was stopped`,
          remove: `${target.name} was removed from the meeting`,
        };

        if (!actionMessages[action]) {
          return callback?.({ ok: false, message: "Unsupported meeting moderation action" });
        }

        if (action === "mute") {
          updateTargetCallState(channel, targetUserId, { micOn: false });
          io.to(`user:${targetUserId}`).emit("meeting-force-mute", {
            roomId,
            meetingId,
            moderator,
            message: actionMessages[action],
          });
        }

        if (action === "cameraOff") {
          updateTargetCallState(channel, targetUserId, { cameraOn: false });
          io.to(`user:${targetUserId}`).emit("meeting-force-camera-off", {
            roomId,
            meetingId,
            moderator,
            message: actionMessages[action],
          });
        }

        if (action === "stopScreenShare") {
          updateTargetCallState(channel, targetUserId, { screenSharing: false });
          io.to(`user:${targetUserId}`).emit("meeting-force-screen-share-stop", {
            roomId,
            meetingId,
            moderator,
            message: actionMessages[action],
          });
        }

        if (action === "remove") {
          const callUsers = callUsersByRoom.get(channel);

          for (const [socketId, targetCallUser] of targetEntries) {
            const targetSocket = io.sockets.sockets.get(socketId);
            callUsers?.delete(socketId);

            if (targetSocket) {
              for (const callRoom of Array.from(targetSocket.callRooms || [])) {
                const callChannel = typeof callRoom === "string" ? callRoom : callRoom.channel;

                if (callChannel === channel) {
                  targetSocket.callRooms.delete(callRoom);
                }
              }

              targetSocket.leave(channel);
              targetSocket.emit("meeting-kicked", {
                roomId,
                meetingId,
                moderator,
                user: targetCallUser,
                message: actionMessages[action],
              });
            }
          }

          await markMeetingParticipantLeft(meetingId, targetUserId);
          await emitRoomMeetingUpdate(io, roomId, meetingId);

          if (callUsers?.size === 0) {
            callUsersByRoom.delete(channel);
            meetingMessagesByChannel.delete(channel);
          }

          io.to(channel).emit("call-user-left", {
            roomId,
            meetingId,
            socketId: targetEntries[0][0],
            user: target,
            users: sortPresenterFirst(getCallUsers(channel)),
          });
        }

        emitCallParticipants(io, channel, roomId, meetingId);
        socket.emit("meeting-moderation-confirmation", {
          roomId,
          meetingId,
          action,
          target,
          message: confirmationMessages[action],
        });

        await createNotification({
          io,
          recipient: targetUserId,
          type: action === "remove" ? "REMOVED_FROM_ROOM" : "MODERATION_ACTION",
          title: action === "remove" ? "Removed from meeting" : "Meeting moderation",
          message: actionMessages[action],
          room: roomId,
          meeting: meetingId,
        });

        return callback?.({ ok: true, message: confirmationMessages[action] });
      } catch (err) {
        return callback?.({ ok: false, message: "Could not apply meeting moderation" });
      }
    });

    socket.on("subscribe-activity", async ({ roomId = null, meetingId = null } = {}, callback) => {
      try {
        socket.join(`activity:user:${socket.user._id.toString()}`);

        if (isModeratorOrAdmin(socket.user)) {
          socket.join("activity:all");
        }

        if (roomId) {
          const room = await findRoomForAccess(roomId);

          if (!room) return callback?.({ ok: false, message: "Room not found" });

          const access = canAccessRoom(socket.user, room);

          if (!access.allowed) return callback?.({ ok: false, message: access.message });

          socket.join(`activity:room:${roomId}`);
        }

        if (meetingId) {
          socket.join(`activity:meeting:${meetingId}`);
        }

        return callback?.({ ok: true });
      } catch {
        return callback?.({ ok: false, message: "Could not subscribe to activity" });
      }
    });

    socket.on("offer", ({ roomId, meetingId = null, targetSocketId, offer }) => {
      if (!roomId || !targetSocketId || !offer) {
        return;
      }

      io.to(targetSocketId).emit("offer", {
        roomId,
        fromSocketId: socket.id,
        user: formatUser(socket.user),
        meetingId,
        offer,
      });
    });

    socket.on("answer", ({ roomId, meetingId = null, targetSocketId, answer }) => {
      if (!roomId || !targetSocketId || !answer) {
        return;
      }

      io.to(targetSocketId).emit("answer", {
        roomId,
        fromSocketId: socket.id,
        user: formatUser(socket.user),
        meetingId,
        answer,
      });
    });

    socket.on("ice-candidate", ({ roomId, meetingId = null, targetSocketId, candidate }) => {
      if (!roomId || !targetSocketId || !candidate) {
        return;
      }

      io.to(targetSocketId).emit("ice-candidate", {
        roomId,
        fromSocketId: socket.id,
        user: formatUser(socket.user),
        meetingId,
        candidate,
      });
    });

    socket.on("screen-share-start", async ({ roomId, meetingId = null }) => {
      if (!roomId) return;

      try {
        const channel = getCallChannel(roomId, meetingId);
        const room = await findRoomForAccess(roomId);

        if (!room) {
          return socket.emit("screen-share-error", {
            roomId,
            message: "Room not found",
          });
        }

        // if user is blocked from screen sharing
        const blocked = (room.screenShareBlocked || []).some(
          (u) => (u._id || u).toString() === socket.user._id.toString()
        );

        if (blocked) {
          return socket.emit("screen-share-error", {
            roomId,
            message: "Screen sharing has been blocked by a moderator.",
          });
        }

        const callUsers = callUsersByRoom.get(channel);
        if (callUsers?.has(socket.id)) {
          for (const [participantSocketId, participant] of callUsers.entries()) {
            if (participantSocketId !== socket.id && participant.screenSharing) {
              callUsers.set(participantSocketId, {
                ...participant,
                screenSharing: false,
              });
            }
          }

          callUsers.set(socket.id, {
            ...callUsers.get(socket.id),
            screenSharing: true,
          });
        }

        socket.to(channel).emit("screen-share-start", {
          roomId,
          meetingId,
          socketId: socket.id,
          user: formatUser(socket.user),
        });
        io.to(channel).emit("meeting-participants", {
          roomId,
          meetingId,
          users: sortPresenterFirst(getCallUsers(channel)),
        });
      } catch (err) {
        socket.emit("screen-share-error", {
          roomId,
          message: "Could not start screen share",
        });
      }
    });

    // Moderation events
    socket.on("mute-user", async ({ roomId, targetUserId }, callback) => {
      try {
        if (!isModeratorOrAdmin(socket.user)) {
          return callback?.({ ok: false, message: "Insufficient permissions" });
        }

        const room = await findRoomForAccess(roomId);

        if (!room) return callback?.({ ok: false, message: "Room not found" });

        const targetUser = await User.findById(targetUserId).select("role name");

        if (!targetUser) return callback?.({ ok: false, message: "User not found" });

        if (targetUser.role === "admin" && socket.user.role !== "admin") {
          return callback?.({ ok: false, message: "Cannot moderate an admin" });
        }

        await Room.findByIdAndUpdate(roomId, { $addToSet: { mutedUsers: targetUserId } });

        io.to(roomId).emit("user-muted", { roomId, userId: targetUserId });
        io.to(`user:${targetUserId}`).emit("force-mute", { roomId });
        await emitRoomParticipants(io, roomId);
        logActivity(io, {
          actor: socket.user._id,
          targetUser: targetUserId,
          room: roomId,
          action: ACTIONS.USER_MUTED,
          description: `${socket.user.name} muted ${targetUser.name}`,
        });
        await createNotification({
          io,
          recipient: targetUserId,
          type: "MODERATION_ACTION",
          title: "You were muted",
          message: `${socket.user.name} muted you in this room.`,
          room: roomId,
        });

        return callback?.({ ok: true });
      } catch (err) {
        return callback?.({ ok: false, message: "Could not mute user" });
      }
    });

    socket.on("unmute-user", async ({ roomId, targetUserId }, callback) => {
      try {
        if (!isModeratorOrAdmin(socket.user)) {
          return callback?.({ ok: false, message: "Insufficient permissions" });
        }

        const room = await findRoomForAccess(roomId);

        if (!room) return callback?.({ ok: false, message: "Room not found" });

        const targetUser = await User.findById(targetUserId).select("role name");

        if (!targetUser) return callback?.({ ok: false, message: "User not found" });

        await Room.findByIdAndUpdate(roomId, { $pull: { mutedUsers: targetUserId } });

        io.to(roomId).emit("user-unmuted", { roomId, userId: targetUserId });
        io.to(`user:${targetUserId}`).emit("force-unmute", { roomId });
        await emitRoomParticipants(io, roomId);
        logActivity(io, {
          actor: socket.user._id,
          targetUser: targetUserId,
          room: roomId,
          action: ACTIONS.USER_UNMUTED,
          description: `${socket.user.name} unmuted ${targetUser.name}`,
        });

        return callback?.({ ok: true });
      } catch (err) {
        return callback?.({ ok: false, message: "Could not unmute user" });
      }
    });

    socket.on("kick-user", async ({ roomId, targetUserId }, callback) => {
      try {
        if (!isModeratorOrAdmin(socket.user)) {
          return callback?.({ ok: false, message: "Insufficient permissions" });
        }

        const room = await findRoomForAccess(roomId);

        if (!room) return callback?.({ ok: false, message: "Room not found" });

        const targetUser = await User.findById(targetUserId).select("role name");

        if (!targetUser) return callback?.({ ok: false, message: "User not found" });

        if (targetUser.role === "admin" && socket.user.role !== "admin") {
          return callback?.({ ok: false, message: "Cannot moderate an admin" });
        }
        if (targetUser.role === "moderator" && socket.user.role !== "admin") {
          return callback?.({ ok: false, message: "Only admins can remove a moderator" });
        }

        const updatedRoom = await Room.findByIdAndUpdate(
          roomId,
          {
            $pull: { members: targetUserId, assignedUsers: targetUserId },
            $addToSet: { removedUsers: targetUserId },
          },
          { new: true }
        ).populate("members", "name email role");
        await RoomInvitation.updateMany(
          { room: roomId, invitedUser: targetUserId, status: { $in: ["pending", "accepted"] } },
          { status: "rejected", invitedUserRead: true, inviterRead: false }
        );

        // remove their sockets from the room and notify
        removeUserSocketsFromRoom(io, roomId, targetUserId);

        io.to(roomId).emit("user-kicked", { roomId, userId: targetUserId });
        await emitRoomParticipants(io, roomId, updatedRoom);
        logActivity(io, {
          actor: socket.user._id,
          targetUser: targetUserId,
          room: roomId,
          action: ACTIONS.USER_KICKED,
          description: `${socket.user.name} removed ${targetUser.name} from the room`,
        });
        await createNotification({
          io,
          recipient: targetUserId,
          type: "REMOVED_FROM_ROOM",
          title: "You were removed from a room",
          message: `${socket.user.name} removed you from this room.`,
          room: roomId,
        });

        return callback?.({ ok: true });
      } catch (err) {
        return callback?.({ ok: false, message: "Could not remove user" });
      }
    });

    socket.on("toggle-screen-share-permission", async ({ roomId, targetUserId, allow }, callback) => {
      try {
        if (!isModeratorOrAdmin(socket.user)) {
          return callback?.({ ok: false, message: "Insufficient permissions" });
        }

        const room = await findRoomForAccess(roomId);

        if (!room) return callback?.({ ok: false, message: "Room not found" });

        const targetUser = await User.findById(targetUserId).select("role name");

        if (!targetUser) return callback?.({ ok: false, message: "User not found" });

        if (targetUser.role === "admin" && socket.user.role !== "admin") {
          return callback?.({ ok: false, message: "Cannot moderate an admin" });
        }

        if (allow) {
          await Room.findByIdAndUpdate(roomId, { $pull: { screenShareBlocked: targetUserId } });
        } else {
          await Room.findByIdAndUpdate(roomId, { $addToSet: { screenShareBlocked: targetUserId } });
        }

        io.to(roomId).emit("screen-share-updated", { roomId, userId: targetUserId, allowed: !!allow });
        io.to(`user:${targetUserId}`).emit("screen-share-permission", { roomId, allowed: !!allow });
        await emitRoomParticipants(io, roomId);
        logActivity(io, {
          actor: socket.user._id,
          targetUser: targetUserId,
          room: roomId,
          action: allow ? ACTIONS.SCREEN_SHARE_ALLOWED : ACTIONS.SCREEN_SHARE_BLOCKED,
          description: `${socket.user.name} ${allow ? "allowed" : "blocked"} screen sharing for ${targetUser.name}`,
        });
        await createNotification({
          io,
          recipient: targetUserId,
          type: "MODERATION_ACTION",
          title: allow ? "Screen sharing restored" : "Screen sharing blocked",
          message: `${socket.user.name} ${allow ? "allowed" : "blocked"} screen sharing for you.`,
          room: roomId,
        });

        return callback?.({ ok: true });
      } catch (err) {
        return callback?.({ ok: false, message: "Could not update screen share permission" });
      }
    });

    socket.on("screen-share-stop", ({ roomId, meetingId = null }) => {
      if (!roomId) {
        return;
      }

      const channel = getCallChannel(roomId, meetingId);
      const callUsers = callUsersByRoom.get(channel);
      if (callUsers?.has(socket.id)) {
        callUsers.set(socket.id, {
          ...callUsers.get(socket.id),
          screenSharing: false,
        });
      }

      socket.to(channel).emit("screen-share-stop", {
        roomId,
        meetingId,
        socketId: socket.id,
        user: formatUser(socket.user),
      });
      io.to(channel).emit("meeting-participants", {
        roomId,
        meetingId,
        users: sortPresenterFirst(getCallUsers(channel)),
      });
    });

    socket.on("disconnect", async () => {
      await Promise.all(
        Array.from(socket.joinedRooms).map((roomId) =>
          removeSocketFromRoom(io, socket, roomId)
        )
      );
      await Promise.all(
        Array.from(socket.callRooms).map((callRoom) =>
          removeSocketFromCall(io, socket, callRoom)
        )
      );

      console.log("User disconnected:", socket.id);
    });
  });
};

module.exports = socketHandler;
