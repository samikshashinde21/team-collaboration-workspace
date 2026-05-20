const normalizeIds = (values = []) =>
  values.map((value) => (value?._id || value)?.toString()).filter(Boolean);

const canAccessRoom = (user, room) => {
  if (!user || !room) {
    return { allowed: false, message: "Room access could not be verified." };
  }

  if (user.role === "admin" || user.role === "moderator") {
    return { allowed: true };
  }

  const userId = user._id?.toString() || user.id?.toString();
  const removedUserIds = normalizeIds(room.removedUsers || []);

  if (removedUserIds.includes(userId)) {
    return {
      allowed: false,
      message: "Access denied. You were removed from this room.",
    };
  }

  if (room.isOpenToEveryone ?? !room.isPrivate) {
    return { allowed: true };
  }

  const assignedUserIds = normalizeIds(room.assignedUsers || room.allowedUsers);

  if (assignedUserIds.includes(userId)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    message: "Access denied. This room is restricted to assigned users, moderators, and admins.",
  };
};

const validateRoomPermissions = ({ assignedUsers = [] }) => {
  if (!Array.isArray(assignedUsers)) {
    return "Assigned users must be an array.";
  }

  return "";
};

module.exports = {
  canAccessRoom,
  validateRoomPermissions,
};
