const express = require("express");
const {
  createRoom,
  getRooms,
  getRoomById,
  deleteRoom,
  getRoomActivity,
  getRoomMeetings,
  startMeeting,
  getMeetingById,
  endMeeting,
} = require("../controllers/roomController");
const protect = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.post("/", protect, authorizeRoles("admin"), createRoom);
router.get("/", protect, getRooms);
router.get("/:id/activity", protect, getRoomActivity);
router.get("/:id/meetings", protect, getRoomMeetings);
router.post("/:id/meetings", protect, startMeeting);
router.get("/:id/meetings/:meetingId", protect, getMeetingById);
router.patch("/:id/meetings/:meetingId/end", protect, endMeeting);
router.get("/:id", protect, getRoomById);
router.delete("/:id", protect, authorizeRoles("admin"), deleteRoom);

module.exports = router;
