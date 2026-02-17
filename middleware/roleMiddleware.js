const User = require("../models/User");

const adminOnly = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("role");

    if (!user) {
      return res.status(401).json({ message: "Not authorized" });
    }

    if (user.role !== "admin") {
      return res.status(403).json({ message: "Admin access only" });
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = { adminOnly };
