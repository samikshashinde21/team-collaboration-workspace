const allowedRoomRoles = ["admin", "moderator", "user"];

const normalizeIds = (values = []) =>
  values.map((value) => (value?._id || value)?.toString()).filter(Boolean);

const getRoomLocked = (room) => Boolean(room.locked ?? room.isLocked);

const canAccessRoom = (user, room) => {
  if (!user || !room) {
    return { allowed: false, message: "Room access could not be verified." };
  }

  if (user.role === "admin") {
    return { allowed: true };
  }

  if (getRoomLocked(room) && user.role !== "moderator") {
    return {
      allowed: false,
      message: "This room is locked. Only admins and moderators can join.",
    };
  }

  if (!room.isPrivate) {
    return { allowed: true };
  }

  const userId = user._id?.toString() || user.id?.toString();
  const allowedUserIds = normalizeIds(room.allowedUsers);
  const allowedRoles = room.allowedRoles || [];

  if (allowedUserIds.includes(userId) || allowedRoles.includes(user.role)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    message: "Access denied. This private room is limited to assigned users or roles.",
  };
};

const validateRoomPermissions = ({ isPrivate, allowedUsers = [], allowedRoles = [] }) => {
  if (!Array.isArray(allowedUsers)) {
    return "Allowed users must be an array.";
  }

  if (!Array.isArray(allowedRoles)) {
    return "Allowed roles must be an array.";
  }

  const invalidRoles = allowedRoles.filter((role) => !allowedRoomRoles.includes(role));

  if (invalidRoles.length > 0) {
    return "Allowed roles must be admin, moderator, or user.";
  }

  if (!isPrivate && (allowedUsers.length > 0 || allowedRoles.length > 0)) {
    return "Allowed users and roles can only be assigned to private rooms.";
  }

  return "";
};

module.exports = {
  allowedRoomRoles,
  canAccessRoom,
  getRoomLocked,
  validateRoomPermissions,
};
