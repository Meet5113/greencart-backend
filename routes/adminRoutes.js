const express = require("express");
const { getAnalytics } = require("../controllers/adminController");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/roleMiddleware");

const router = express.Router();

router.get("/analytics", protect, adminOnly, getAnalytics);

module.exports = router;
