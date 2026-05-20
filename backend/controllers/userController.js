const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { ACTIONS, createActivityLog } = require("../services/activityLogger");
const { createNotification } = require("../services/notificationService");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const avatarPattern = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;
const isStrongPassword = (password = "") =>
  password.length > 6 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);

const formatUserProfile = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  avatarUrl: user.avatarUrl || "",
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const getUsers = async (req, res) => {
  try {
    const query = req.user.role === "moderator" ? { role: { $ne: "admin" } } : {};
    const users = await User.find(query).select("-password").sort({ createdAt: -1 });

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch users", error: error.message });
  }
};

const updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    const allowedRoles = ["admin", "moderator", "user"];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: "Role must be admin, moderator, or user" });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.role = role;
    await user.save();

    await createActivityLog({
      io: req.app.get("io"),
      actor: req.user._id,
      targetUser: user._id,
      action: ACTIONS.USER_ROLE_UPDATED,
      description: `${req.user.name} changed ${user.email} to ${role}`,
    });
    await createNotification({
      io: req.app.get("io"),
      recipient: user._id,
      type: "ROLE_UPDATED",
      title: "Your role was updated",
      message: `${req.user.name} changed your role to ${role}.`,
    });

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to update user role", error: error.message });
  }
};

const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(formatUserProfile(user));
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch profile", error: error.message });
  }
};

const updateMe = async (req, res) => {
  try {
    const {
      name,
      email,
      avatarUrl,
      newPassword,
      confirmPassword,
    } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!name?.trim()) {
      return res.status(400).json({ message: "Full name is required." });
    }

    if (!emailPattern.test(email || "")) {
      return res.status(400).json({ message: "A valid email is required." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingEmailUser = await User.findOne({
      email: normalizedEmail,
      _id: { $ne: user._id },
    });

    if (existingEmailUser) {
      return res.status(400).json({ message: "Email is already in use." });
    }

    if (avatarUrl && (!avatarPattern.test(avatarUrl) || avatarUrl.length > 700000)) {
      return res.status(400).json({ message: "Profile photo must be a PNG, JPG, or WebP image under 500 KB." });
    }

    const passwordChanged = Boolean(newPassword || confirmPassword);

    if (passwordChanged) {
      if (!newPassword || !isStrongPassword(newPassword)) {
        return res.status(400).json({
          message: "New password must be more than 6 characters and include uppercase, lowercase, and a number.",
        });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({ message: "Password confirmation does not match." });
      }

      user.password = await bcrypt.hash(newPassword, 10);
    }

    user.name = name.trim();
    user.email = normalizedEmail;
    user.avatarUrl = avatarUrl || "";
    await user.save();

    await createNotification({
      io: req.app.get("io"),
      recipient: user._id,
      type: passwordChanged ? "PASSWORD_CHANGED" : "PROFILE_UPDATED",
      title: passwordChanged ? "Your password was updated successfully" : "Your profile was updated",
      message: passwordChanged
        ? "Your account password was changed."
        : "Your profile information was saved.",
    });

    res.json(formatUserProfile(user));
  } catch (error) {
    res.status(500).json({ message: "Failed to update profile", error: error.message });
  }
};

module.exports = {
  getMe,
  getUsers,
  updateMe,
  updateUserRole,
};
