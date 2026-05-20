const express = require("express");
const { getMe, getUsers, updateMe, updateUserRole } = require("../controllers/userController");
const protect = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.get("/", protect, authorizeRoles("admin", "moderator"), getUsers);
router.get("/me", protect, getMe);
router.patch("/me", protect, updateMe);
router.patch("/:id/role", protect, authorizeRoles("admin"), updateUserRole);

module.exports = router;
