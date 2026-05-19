const jwt = require("jsonwebtoken");
const Message = require("../models/Message");
const Room = require("../models/Room");
const User = require("../models/User");
const { onlineUsersByRoom, callUsersByRoom } = require("../services/presenceStore");
const { canAccessRoom } = require("../services/roomAccess");

const formatUser = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
});

const formatMessage = (message) => ({
  id: message._id.toString(),
  room: message.room.toString(),
  content: message.content,
  sender: formatUser(message.sender),
  createdAt: message.createdAt,
});

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

const getCallUsers = (roomId) => {
  const users = callUsersByRoom.get(roomId);

  return users ? Array.from(users.values()) : [];
};

const removeSocketFromCall = (io, socket, roomId) => {
  const callUsers = callUsersByRoom.get(roomId);

  if (!callUsers) {
    return;
  }

  const removedUser = callUsers.get(socket.id);
  callUsers.delete(socket.id);

  if (callUsers.size === 0) {
    callUsersByRoom.delete(roomId);
  }

  socket.leave(roomId);
  socket.to(roomId).emit("call-user-left", {
    roomId,
    socketId: socket.id,
    user: removedUser || formatUser(socket.user),
    users: getCallUsers(roomId),
  });
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
      socket.joinedRooms.delete(roomId);
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

        io.to(roomId).emit("message", formattedMessage);
        socket.to(roomId).emit("stop-typing", {
          roomId,
          user: formatUser(socket.user),
        });

        callback?.({ ok: true, message: formattedMessage });
      } catch (error) {
        callback?.({ ok: false, message: "Could not send message" });
      }
    });

    socket.on("typing", ({ roomId }) => {
      if (!roomId) {
        return;
      }

      socket.to(roomId).emit("typing", {
        roomId,
        user: formatUser(socket.user),
      });
    });

    socket.on("stop-typing", ({ roomId }) => {
      if (!roomId) {
        return;
      }

      socket.to(roomId).emit("stop-typing", {
        roomId,
        user: formatUser(socket.user),
      });
    });

    socket.on("join-call", async ({ roomId }, callback) => {
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

      socket.join(roomId);
      socket.callRooms.add(roomId);

      if (!callUsersByRoom.has(roomId)) {
        callUsersByRoom.set(roomId, new Map());
      }

      const callUser = {
        socketId: socket.id,
        ...formatUser(socket.user),
      };
      const existingUsers = getCallUsers(roomId);

      if (!callUsersByRoom.get(roomId).has(socket.id) && existingUsers.length >= 2) {
        socket.leave(roomId);
        socket.callRooms.delete(roomId);
        return callback?.({ ok: false, message: "This call already has two participants" });
      }

      callUsersByRoom.get(roomId).set(socket.id, callUser);

      socket.to(roomId).emit("call-user-joined", {
        roomId,
        socketId: socket.id,
        user: callUser,
        users: getCallUsers(roomId),
      });

      callback?.({ ok: true, users: existingUsers });
    });

    socket.on("leave-call", ({ roomId }) => {
      if (!roomId) {
        return;
      }

      removeSocketFromCall(io, socket, roomId);
      socket.callRooms.delete(roomId);
    });

    socket.on("offer", ({ roomId, targetSocketId, offer }) => {
      if (!roomId || !targetSocketId || !offer) {
        return;
      }

      io.to(targetSocketId).emit("offer", {
        roomId,
        fromSocketId: socket.id,
        user: formatUser(socket.user),
        offer,
      });
    });

    socket.on("answer", ({ roomId, targetSocketId, answer }) => {
      if (!roomId || !targetSocketId || !answer) {
        return;
      }

      io.to(targetSocketId).emit("answer", {
        roomId,
        fromSocketId: socket.id,
        user: formatUser(socket.user),
        answer,
      });
    });

    socket.on("ice-candidate", ({ roomId, targetSocketId, candidate }) => {
      if (!roomId || !targetSocketId || !candidate) {
        return;
      }

      io.to(targetSocketId).emit("ice-candidate", {
        roomId,
        fromSocketId: socket.id,
        user: formatUser(socket.user),
        candidate,
      });
    });

    socket.on("screen-share-start", async ({ roomId }) => {
      if (!roomId) return;

      try {
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

        socket.to(roomId).emit("screen-share-start", {
          roomId,
          socketId: socket.id,
          user: formatUser(socket.user),
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

        await Room.findByIdAndUpdate(roomId, { $pull: { members: targetUserId } });

        // remove their sockets from the room and notify
        removeUserSocketsFromRoom(io, roomId, targetUserId);

        io.to(roomId).emit("user-kicked", { roomId, userId: targetUserId });
        await emitRoomParticipants(io, roomId);

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

        return callback?.({ ok: true });
      } catch (err) {
        return callback?.({ ok: false, message: "Could not update screen share permission" });
      }
    });

    socket.on("screen-share-stop", ({ roomId }) => {
      if (!roomId) {
        return;
      }

      socket.to(roomId).emit("screen-share-stop", {
        roomId,
        socketId: socket.id,
        user: formatUser(socket.user),
      });
    });

    socket.on("disconnect", async () => {
      await Promise.all(
        Array.from(socket.joinedRooms).map((roomId) =>
          removeSocketFromRoom(io, socket, roomId)
        )
      );
      socket.callRooms.forEach((roomId) => {
        removeSocketFromCall(io, socket, roomId);
      });

      console.log("User disconnected:", socket.id);
    });
  });
};

module.exports = socketHandler;
