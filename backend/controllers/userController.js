const User = require("../models/User");
const ActivityLog = require("../models/ActivityLog");

const getUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });

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

    await ActivityLog.create({
      user: req.user._id,
      action: "USER_ROLE_UPDATED",
      details: `${req.user.name} changed ${user.email} to ${role}`,
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

module.exports = {
  getUsers,
  updateUserRole,
};
