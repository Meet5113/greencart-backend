const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      alias: "adminId",
    },
    action: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    entity: {
      type: String,
      required: true,
      enum: ["product", "order", "subscription", "user", "system"],
      index: true,
      alias: "entityType",
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    ipAddress: {
      type: String,
      default: "",
      trim: true,
      maxlength: 64,
    },
    userAgent: {
      type: String,
      default: "",
      trim: true,
      maxlength: 512,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    minimize: true,
    versionKey: false,
  }
);

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
