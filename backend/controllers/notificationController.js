const Notification = require("../models/Notification");
const { formatNotification, populateNotification } = require("../services/notificationService");

const getNotifications = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const notifications = await populateNotification(
      Notification.find({ recipient: req.user._id }).sort({ createdAt: -1 }).limit(limit)
    );
    const unreadCount = await Notification.countDocuments({ recipient: req.user._id, readAt: null });

    res.json({
      notifications: notifications.map(formatNotification),
      unreadCount,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch notifications", error: error.message });
  }
};

const markNotificationRead = async (req, res) => {
  try {
    const notification = await populateNotification(
      Notification.findOneAndUpdate(
        { _id: req.params.id, recipient: req.user._id },
        { readAt: new Date() },
        { new: true }
      )
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found." });
    }

    res.json(formatNotification(notification));
  } catch (error) {
    res.status(500).json({ message: "Failed to mark notification read", error: error.message });
  }
};

const markAllNotificationsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, readAt: null },
      { readAt: new Date() }
    );

    res.json({ message: "Notifications marked as read." });
  } catch (error) {
    res.status(500).json({ message: "Failed to mark notifications read", error: error.message });
  }
};

const clearNotifications = async (req, res) => {
  try {
    await Notification.deleteMany({ recipient: req.user._id });
    res.json({ message: "Notifications cleared." });
  } catch (error) {
    res.status(500).json({ message: "Failed to clear notifications", error: error.message });
  }
};

module.exports = {
  clearNotifications,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
};
