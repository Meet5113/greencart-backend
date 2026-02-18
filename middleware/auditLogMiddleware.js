const AuditLog = require("../models/AuditLog");

const resolveIpAddress = (req) => {
  const forwardedFor = req?.headers?.["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  if (typeof req?.ip === "string" && req.ip.trim()) {
    return req.ip.trim();
  }

  if (typeof req?.socket?.remoteAddress === "string") {
    return req.socket.remoteAddress.trim();
  }

  return "";
};

const logAdminAction = async ({
  adminId,
  action,
  entityType,
  entityId = null,
  metadata = null,
  req,
}) => {
  try {
    if (!adminId || !action || !entityType) {
      return null;
    }

    return await AuditLog.create({
      admin: adminId,
      action,
      entity: entityType,
      entityId,
      metadata,
      ipAddress: resolveIpAddress(req),
      userAgent: req?.headers?.["user-agent"] || "",
    });
  } catch {
    return null;
  }
};

const attachAuditLogger = (req, res, next) => {
  req.logAdminAction = (payload = {}) =>
    logAdminAction({
      adminId: payload.adminId || req?.user?.id,
      action: payload.action,
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadata: payload.metadata,
      req: payload.req || req,
    });

  next();
};

module.exports = { logAdminAction, attachAuditLogger };
