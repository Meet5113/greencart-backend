const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { logAdminAction } = require("../middleware/auditLogMiddleware");

const accessTokenTtl = process.env.JWT_ACCESS_EXPIRES_IN || "1h";
const refreshTokenTtl = process.env.JWT_REFRESH_EXPIRES_IN || "7d";

const getRefreshSecret = () => process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

const generateAccessToken = (id) => {
  return jwt.sign({ id, tokenType: "access" }, process.env.JWT_SECRET, {
    expiresIn: accessTokenTtl,
  });
};

const generateRefreshToken = (id) => {
  return jwt.sign({ id, tokenType: "refresh" }, getRefreshSecret(), {
    expiresIn: refreshTokenTtl,
  });
};

const registerUser = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email, and password are required" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "JWT_SECRET is missing in environment variables" });
    }

    const userExists = await User.findOne({ email: email.toLowerCase() });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const user = await User.create({ name, email, password });

    return res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateAccessToken(user._id),
      refreshToken: generateRefreshToken(user._id),
    });
  } catch (error) {
    return next(error);
  }
};

const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "JWT_SECRET is missing in environment variables" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (user.role === "admin") {
      void logAdminAction({
        adminId: user._id,
        action: "admin.login",
        entityType: "user",
        entityId: user._id,
        metadata: {
          email: user.email,
        },
        req,
      });
    }

    return res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateAccessToken(user._id),
      refreshToken: generateRefreshToken(user._id),
    });
  } catch (error) {
    return next(error);
  }
};

const logoutUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("role email");

    if (user?.role === "admin") {
      void logAdminAction({
        adminId: user._id,
        action: "admin.logout",
        entityType: "user",
        entityId: user._id,
        metadata: {
          email: user.email,
        },
        req,
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return next(error);
  }
};

const refreshAccessToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: "refreshToken is required" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "JWT_SECRET is missing in environment variables" });
    }

    const decoded = jwt.verify(refreshToken, getRefreshSecret());
    if (!decoded?.id || decoded?.tokenType !== "refresh") {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const user = await User.findById(decoded.id).select("_id name email role");
    if (!user) {
      return res.status(401).json({ message: "Not authorized" });
    }

    return res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateAccessToken(user._id),
      refreshToken: generateRefreshToken(user._id),
    });
  } catch (error) {
    if (error?.name === "TokenExpiredError" || error?.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    return next(error);
  }
};

const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json(user);
  } catch (error) {
    return next(error);
  }
};

module.exports = { registerUser, loginUser, logoutUser, refreshAccessToken, getMe };
