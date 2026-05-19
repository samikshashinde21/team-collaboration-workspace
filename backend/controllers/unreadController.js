const { getUnreadCounts } = require("../services/unreadService");

const getMyUnreadCounts = async (req, res) => {
  try {
    res.json(await getUnreadCounts(req.user._id));
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch unread counts", error: error.message });
  }
};

module.exports = {
  getMyUnreadCounts,
};
