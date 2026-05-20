const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { ACTIONS, createActivityLog } = require("../services/activityLogger");

const createToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

const isStrongPassword = (password = "") =>
  password.length > 6 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);

const sendAuthResponse = (res, statusCode, user) => {
  const token = createToken(user._id);

  return res.status(statusCode).json({
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl || "",
      createdAt: user.createdAt,
    },
  });
};

const register = async (req, res) => {
  try {
    console.log("Register request body:", req.body);

    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message: "Password must be more than 6 characters and include uppercase, lowercase, and a number.",
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const userCount = await User.countDocuments();
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: userCount === 0 ? "admin" : "user",
    });

    return sendAuthResponse(res, 201, user);
  } catch (error) {
    return res.status(500).json({ message: "Registration failed", error: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    await createActivityLog({
      io: req.app.get("io"),
      actor: user._id,
      action: ACTIONS.USER_LOGIN,
      description: `${user.name} logged in`,
    });

    return sendAuthResponse(res, 200, user);
  } catch (error) {
    return res.status(500).json({ message: "Login failed", error: error.message });
  }
};

module.exports = {
  register,
  login,
};
