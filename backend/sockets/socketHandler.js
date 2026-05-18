const jwt = require("jsonwebtoken");
const Message = require("../models/Message");
const Room = require("../models/Room");
const User = require("../models/User");

const onlineUsersByRoom = new Map();
const callUsersByRoom = new Map();

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

  return users ? Array.from(users.values()) : [];
};

const emitOnlineUsers = (io, roomId) => {
  io.to(roomId).emit("online-users", {
    roomId,
    users: getOnlineUsers(roomId),
  });
};

const removeSocketFromRoom = (io, socket, roomId) => {
  const roomUsers = onlineUsersByRoom.get(roomId);

  if (!roomUsers) {
    return;
  }

  roomUsers.delete(socket.id);

  if (roomUsers.size === 0) {
    onlineUsersByRoom.delete(roomId);
  }

  socket.leave(roomId);
  emitOnlineUsers(io, roomId);
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

        const room = await Room.findByIdAndUpdate(
          roomId,
          { $addToSet: { members: socket.user._id } },
          { new: true }
        ).populate("members", "name email role");

        if (!room) {
          return callback?.({ ok: false, message: "Room not found" });
        }

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
        io.to(roomId).emit("room-participants", {
          roomId,
          participants: room.members.map(formatUser),
        });
        emitOnlineUsers(io, roomId);

        callback?.({ ok: true });
      } catch (error) {
        callback?.({ ok: false, message: "Could not join room" });
      }
    });

    socket.on("leave-room", ({ roomId }) => {
      if (!roomId) {
        return;
      }

      removeSocketFromRoom(io, socket, roomId);
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

    socket.on("join-call", ({ roomId }, callback) => {
      if (!roomId) {
        return callback?.({ ok: false, message: "Room ID is required" });
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

    socket.on("screen-share-start", ({ roomId }) => {
      if (!roomId) {
        return;
      }

      socket.to(roomId).emit("screen-share-start", {
        roomId,
        socketId: socket.id,
        user: formatUser(socket.user),
      });
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

    socket.on("disconnect", () => {
      socket.joinedRooms.forEach((roomId) => {
        removeSocketFromRoom(io, socket, roomId);
      });
      socket.callRooms.forEach((roomId) => {
        removeSocketFromCall(io, socket, roomId);
      });

      console.log("User disconnected:", socket.id);
    });
  });
};

module.exports = socketHandler;
