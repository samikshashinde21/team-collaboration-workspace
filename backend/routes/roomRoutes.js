const express = require("express");
const { createRoom, getRooms, deleteRoom } = require("../controllers/roomController");
const protect = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.post("/", protect, createRoom);
router.get("/", protect, getRooms);
router.delete("/:id", protect, authorizeRoles("admin", "moderator"), deleteRoom);

module.exports = router;
