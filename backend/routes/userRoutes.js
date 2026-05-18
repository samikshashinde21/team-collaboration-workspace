const express = require("express");
const { getUsers, updateUserRole } = require("../controllers/userController");
const protect = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const router = express.Router();

router.get("/", protect, authorizeRoles("admin", "moderator"), getUsers);
router.patch("/:id/role", protect, authorizeRoles("admin"), updateUserRole);

module.exports = router;
