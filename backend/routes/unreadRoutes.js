const express = require("express");
const { getMyUnreadCounts } = require("../controllers/unreadController");
const protect = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, getMyUnreadCounts);

module.exports = router;
