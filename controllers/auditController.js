const mongoose = require("mongoose");
const AuditLog = require("../models/AuditLog");

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
};

const getAuditLogs = async (req, res, next) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100);
    const skip = (page - 1) * limit;

    const { admin, startDate, endDate } = req.query;
    const filter = {};

    if (admin) {
      if (!mongoose.Types.ObjectId.isValid(admin)) {
        return res.status(400).json({ message: "Invalid admin value" });
      }
      filter.admin = admin;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      let parsedStartDateValue = null;
      let parsedEndDateValue = null;

      if (startDate) {
        const parsedStartDate = new Date(startDate);
        if (Number.isNaN(parsedStartDate.getTime())) {
          return res.status(400).json({ message: "Invalid startDate value" });
        }
        filter.createdAt.$gte = parsedStartDate;
        parsedStartDateValue = parsedStartDate;
      }

      if (endDate) {
        const parsedEndDate = new Date(endDate);
        if (Number.isNaN(parsedEndDate.getTime())) {
          return res.status(400).json({ message: "Invalid endDate value" });
        }
        parsedEndDate.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = parsedEndDate;
        parsedEndDateValue = parsedEndDate;
      }

      if (
        parsedStartDateValue &&
        parsedEndDateValue &&
        parsedStartDateValue.getTime() > parsedEndDateValue.getTime()
      ) {
        return res.status(400).json({ message: "startDate cannot be after endDate" });
      }
    }

    const [total, logs] = await Promise.all([
      AuditLog.countDocuments(filter),
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("admin", "name email")
        .lean(),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit) || 1);

    return res.status(200).json({
      logs,
      total,
      page,
      totalPages,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getAuditLogs };
