const express = require("express");
const { forgotPassword, register, login } = require("../controllers/authController");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);

module.exports = router;
