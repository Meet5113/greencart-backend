const express = require("express");
const {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  getMe,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");
const { attachAuditLogger } = require("../middleware/auditLogMiddleware");

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/refresh", refreshAccessToken);
router.post("/logout", protect, attachAuditLogger, logoutUser);
router.get("/me", protect, getMe);

module.exports = router;
