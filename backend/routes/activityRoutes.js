const express = require("express");
const { getActivity } = require("../controllers/activityController");
const protect = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, getActivity);

module.exports = router;
