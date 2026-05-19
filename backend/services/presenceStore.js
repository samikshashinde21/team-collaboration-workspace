const onlineUsersByRoom = new Map();
const callUsersByRoom = new Map();

const getUniqueOnlineUsers = () => {
  const usersById = new Map();

  onlineUsersByRoom.forEach((roomUsers) => {
    roomUsers.forEach((user) => {
      usersById.set(user.id, user);
    });
  });

  return Array.from(usersById.values());
};

const getPresenceStats = () => ({
  onlineUsersCount: getUniqueOnlineUsers().length,
  activeCallsCount: callUsersByRoom.size,
});

module.exports = {
  onlineUsersByRoom,
  callUsersByRoom,
  getPresenceStats,
};
