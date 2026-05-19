const express = require("express");
const {
  createInvitation,
  getMyInvitations,
  getRoomInvitations,
  markInvitationRead,
  updateInvitation,
} = require("../controllers/invitationController");
const protect = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.post("/", protect, authorizeRoles("admin", "moderator"), createInvitation);
router.get("/my", protect, getMyInvitations);
router.get("/room/:roomId", protect, authorizeRoles("admin", "moderator"), getRoomInvitations);
router.patch("/:id/read", protect, markInvitationRead);
router.patch("/:id", protect, updateInvitation);

module.exports = router;
