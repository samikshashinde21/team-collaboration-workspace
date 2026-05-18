const express = require("express");
const { createRoom, getRooms, getRoomById, deleteRoom } = require("../controllers/roomController");
const protect = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.post("/", protect, authorizeRoles("admin", "moderator"), createRoom);
router.get("/", protect, getRooms);
router.get("/:id", protect, getRoomById);
router.delete("/:id", protect, authorizeRoles("admin"), deleteRoom);

module.exports = router;
