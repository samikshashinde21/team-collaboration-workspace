const normalizeIds = (values = []) =>
  values.map((value) => (value?._id || value)?.toString()).filter(Boolean);

const canAccessRoom = (user, room) => {
  if (!user || !room) {
    return { allowed: false, message: "Room access could not be verified." };
  }

  if (user.role === "admin") {
    return { allowed: true };
  }

  const userId = user._id?.toString() || user.id?.toString();
  const removedUserIds = normalizeIds(room.removedUsers || []);
  const memberIds = normalizeIds(room.members || []);
  const assignedUserIds = normalizeIds(room.assignedUsers || room.allowedUsers);
  const createdById = (room.createdBy?._id || room.createdBy)?.toString();

  if (removedUserIds.includes(userId)) {
    return {
      allowed: false,
      message: "Access denied. You were removed from this room.",
    };
  }

  if (user.role === "moderator") {
    if (memberIds.includes(userId) || assignedUserIds.includes(userId) || createdById === userId) {
      return { allowed: true };
    }

    return {
      allowed: false,
      message: "Access denied. Moderators can only manage rooms they belong to.",
    };
  }

  if (room.isLocked && !memberIds.includes(userId) && !assignedUserIds.includes(userId)) {
    return {
      allowed: false,
      message: "Access denied. This room is locked.",
    };
  }

  if (room.isOpenToEveryone ?? !room.isPrivate) {
    return { allowed: true };
  }

  if (assignedUserIds.includes(userId) || memberIds.includes(userId)) {
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
