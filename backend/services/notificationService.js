const Notification = require("../models/Notification");

const formatReference = (value) =>
  value
    ? {
        id: value._id.toString(),
        name: value.name,
        title: value.title,
      }
    : null;

const formatNotification = (notification) => ({
  id: notification._id.toString(),
  type: notification.type,
  title: notification.title,
  message: notification.message,
  room: formatReference(notification.room),
  meeting: notification.meeting
    ? {
        id: notification.meeting._id.toString(),
        title: notification.meeting.title,
        status: notification.meeting.status,
        scheduledFor: notification.meeting.scheduledFor,
        startedAt: notification.meeting.startedAt,
      }
    : null,
  invitation: notification.invitation?._id
    ? {
        id: notification.invitation._id.toString(),
        status: notification.invitation.status,
      }
    : null,
  readAt: notification.readAt,
  createdAt: notification.createdAt,
});

const populateNotification = (query) =>
  query
    .populate("room", "name")
    .populate("meeting", "title status scheduledFor startedAt")
    .populate("invitation", "status");

const createNotification = async ({ io, recipient, type, title, message = "", room = null, meeting = null, invitation = null }) => {
  if (!recipient || !type || !title) return null;

  const notification = await Notification.create({
    recipient,
    type,
    title,
    message,
    room,
    meeting,
    invitation,
  });
  const populatedNotification = await populateNotification(Notification.findById(notification._id));
  const formattedNotification = formatNotification(populatedNotification);

  io?.to(`user:${recipient.toString()}`).emit("notification-created", formattedNotification);

  return formattedNotification;
};

const createNotifications = async ({ io, recipients = [], ...payload }) => {
  const uniqueRecipients = [...new Set(recipients.map((recipient) => recipient?.toString()).filter(Boolean))];

  return Promise.all(uniqueRecipients.map((recipient) => createNotification({ io, recipient, ...payload })));
};

module.exports = {
  createNotification,
  createNotifications,
  formatNotification,
  populateNotification,
};
