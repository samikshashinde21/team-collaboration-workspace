const Room = require("../models/Room");
const ActivityLog = require("../models/ActivityLog");

const createRoom = async (req, res) => {
  try {
    const { name, description, isLocked } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Room name is required" });
    }

    const room = await Room.create({
      name,
      description,
      isLocked: Boolean(isLocked),
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
      .populate("members", "name email role");

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
      .sort({ createdAt: -1 });

    res.json(rooms);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch rooms", error: error.message });
  }
};

const getRoomById = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id)
      .populate("createdBy", "name email role")
      .populate("members", "name email role");

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
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
