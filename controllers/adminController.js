const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Subscription = require("../models/Subscription");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");

const AUDIT_ENTITY_TYPES = ["product", "order", "subscription", "user", "system"];
const EXPORT_TYPES = ["orders", "revenue", "subscriptions"];

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
};

const parseObjectId = (value, label) => {
  if (!value) return null;
  if (!mongoose.Types.ObjectId.isValid(value)) {
    const error = new Error(`Invalid ${label} value`);
    error.statusCode = 400;
    throw error;
  }
  return new mongoose.Types.ObjectId(value);
};

const parseDateRange = (startDate, endDate) => {
  if (!startDate && !endDate) return null;

  const range = {};
  let parsedStart = null;
  let parsedEnd = null;

  if (startDate) {
    parsedStart = new Date(startDate);
    if (Number.isNaN(parsedStart.getTime())) {
      const error = new Error("Invalid startDate value");
      error.statusCode = 400;
      throw error;
    }
    parsedStart.setHours(0, 0, 0, 0);
    range.$gte = parsedStart;
  }

  if (endDate) {
    parsedEnd = new Date(endDate);
    if (Number.isNaN(parsedEnd.getTime())) {
      const error = new Error("Invalid endDate value");
      error.statusCode = 400;
      throw error;
    }
    parsedEnd.setHours(23, 59, 59, 999);
    range.$lte = parsedEnd;
  }

  if (parsedStart && parsedEnd && parsedStart.getTime() > parsedEnd.getTime()) {
    const error = new Error("startDate cannot be after endDate");
    error.statusCode = 400;
    throw error;
  }

  return range;
};

const buildOrderMatch = ({ dateRange, userObjectId, productObjectId }) => {
  const orderMatch = {};

  if (dateRange) {
    orderMatch.createdAt = dateRange;
  }
  if (userObjectId) {
    orderMatch.user = userObjectId;
  }
  if (productObjectId) {
    orderMatch["orderItems.product"] = productObjectId;
  }

  return orderMatch;
};

const buildItemPipelineBase = ({ dateRange, userObjectId, productObjectId }) => {
  const itemMatch = {};
  if (dateRange) {
    itemMatch.createdAt = dateRange;
  }
  if (userObjectId) {
    itemMatch.user = userObjectId;
  }

  const pipeline = [{ $match: itemMatch }, { $unwind: "$orderItems" }];

  if (productObjectId) {
    pipeline.push({ $match: { "orderItems.product": productObjectId } });
  }

  pipeline.push({
    $lookup: {
      from: "products",
      localField: "orderItems.product",
      foreignField: "_id",
      as: "productDoc",
    },
  });

  pipeline.push({
    $unwind: {
      path: "$productDoc",
      preserveNullAndEmptyArrays: true,
    },
  });

  pipeline.push({
    $addFields: {
      itemRevenue: {
        $multiply: [
          { $ifNull: ["$orderItems.quantity", 0] },
          { $ifNull: ["$productDoc.price", 0] },
        ],
      },
    },
  });

  return pipeline;
};

const buildRevenueTrendPipeline = ({ productObjectId, orderMatch, itemPipelineBase }) => {
  if (productObjectId) {
    return [
      ...itemPipelineBase,
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          value: { $sum: "$itemRevenue" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ];
  }

  return [
    { $match: orderMatch },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
        },
        value: { $sum: "$totalAmount" },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ];
};

const buildOrdersTrendPipeline = ({ orderMatch }) => [
  { $match: orderMatch },
  {
    $group: {
      _id: {
        year: { $year: "$createdAt" },
        month: { $month: "$createdAt" },
      },
      value: { $sum: 1 },
    },
  },
  { $sort: { "_id.year": 1, "_id.month": 1 } },
];

const buildTopProductsPipeline = ({ itemPipelineBase }) => [
  ...itemPipelineBase,
  {
    $group: {
      _id: "$orderItems.product",
      revenue: { $sum: "$itemRevenue" },
      orders: { $addToSet: "$_id" },
      name: { $first: "$productDoc.name" },
    },
  },
  {
    $project: {
      _id: 0,
      productId: "$_id",
      name: { $ifNull: ["$name", "Unknown product"] },
      revenue: 1,
      orderCount: { $size: "$orders" },
    },
  },
  { $sort: { revenue: -1 } },
  { $limit: 5 },
];

const buildTopCustomersPipeline = ({ productObjectId, orderMatch, itemPipelineBase }) => {
  if (productObjectId) {
    return [
      ...itemPipelineBase,
      {
        $group: {
          _id: "$user",
          revenue: { $sum: "$itemRevenue" },
          orders: { $addToSet: "$_id" },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userDoc",
        },
      },
      {
        $unwind: {
          path: "$userDoc",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          userId: "$_id",
          name: { $ifNull: ["$userDoc.name", "Unknown customer"] },
          email: { $ifNull: ["$userDoc.email", "unknown@example.com"] },
          revenue: 1,
          orderCount: { $size: "$orders" },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
    ];
  }

  return [
    { $match: orderMatch },
    {
      $group: {
        _id: "$user",
        revenue: { $sum: "$totalAmount" },
        orderCount: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "userDoc",
      },
    },
    {
      $unwind: {
        path: "$userDoc",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        _id: 0,
        userId: "$_id",
        name: { $ifNull: ["$userDoc.name", "Unknown customer"] },
        email: { $ifNull: ["$userDoc.email", "unknown@example.com"] },
        revenue: 1,
        orderCount: 1,
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: 5 },
  ];
};

const buildCustomerOptionsPipeline = ({ dateRange, productObjectId }) => {
  const customerOptionMatch = {};
  if (dateRange) {
    customerOptionMatch.createdAt = dateRange;
  }
  if (productObjectId) {
    customerOptionMatch["orderItems.product"] = productObjectId;
  }

  return [
    { $match: customerOptionMatch },
    { $group: { _id: "$user" } },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "userDoc",
      },
    },
    {
      $unwind: {
        path: "$userDoc",
        preserveNullAndEmptyArrays: false,
      },
    },
    {
      $project: {
        _id: "$userDoc._id",
        name: "$userDoc.name",
        email: "$userDoc.email",
      },
    },
    { $sort: { email: 1 } },
    { $limit: 200 },
  ];
};

const buildAnalyticsContext = (query = {}) => {
  const { startDate, endDate, productId, userId } = query;
  const productObjectId = parseObjectId(productId, "productId");
  const userObjectId = parseObjectId(userId, "userId");
  const dateRange = parseDateRange(startDate, endDate);

  const orderMatch = buildOrderMatch({
    dateRange,
    userObjectId,
    productObjectId,
  });

  const itemPipelineBase = buildItemPipelineBase({
    dateRange,
    userObjectId,
    productObjectId,
  });

  return {
    dateRange,
    productObjectId,
    userObjectId,
    orderMatch,
    itemPipelineBase,
  };
};

const toMonthLabel = (year, month) => {
  if (!year || !month) return "";
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

const csvEscape = (value) => {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  const escaped = stringValue.replace(/"/g, "\"\"");
  if (/[",\n]/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
};

const buildCsv = (headers, rows) => {
  const allRows = [headers, ...rows];
  return allRows.map((row) => row.map(csvEscape).join(",")).join("\n");
};

const sendCsvResponse = (res, csvContent) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="report.csv"');
  return res.status(200).send(csvContent);
};

const getAnalytics = async (req, res, next) => {
  try {
    const context = buildAnalyticsContext(req.query);
    const {
      dateRange,
      productObjectId,
      userObjectId,
      orderMatch,
      itemPipelineBase,
    } = context;

    const revenueTrendPipeline = buildRevenueTrendPipeline({
      productObjectId,
      orderMatch,
      itemPipelineBase,
    });

    const ordersTrendPipeline = buildOrdersTrendPipeline({ orderMatch });
    const topProductsPipeline = buildTopProductsPipeline({ itemPipelineBase });
    const topCustomersPipeline = buildTopCustomersPipeline({
      productObjectId,
      orderMatch,
      itemPipelineBase,
    });
    const customerOptionsPipeline = buildCustomerOptionsPipeline({
      dateRange,
      productObjectId,
    });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const todayMatch = {
      ...(userObjectId ? { user: userObjectId } : {}),
      ...(productObjectId ? { "orderItems.product": productObjectId } : {}),
      createdAt: { $gte: startOfToday, $lt: endOfToday },
    };

    const [
      totalUsers,
      totalProducts,
      totalOrders,
      totalRevenueAgg,
      activeSubscriptions,
      pausedSubscriptions,
      cancelledSubscriptions,
      todayOrders,
      todayRevenueAgg,
      revenueTrend,
      ordersTrend,
      topProducts,
      topCustomers,
      customerOptions,
      lowStockProducts,
    ] = await Promise.all([
      User.countDocuments(),
      Product.countDocuments(),
      Order.countDocuments(orderMatch),
      productObjectId
        ? Order.aggregate([
            ...itemPipelineBase,
            { $group: { _id: null, total: { $sum: "$itemRevenue" } } },
          ])
        : Order.aggregate([
            { $match: orderMatch },
            { $group: { _id: null, total: { $sum: "$totalAmount" } } },
          ]),
      Subscription.countDocuments({ status: "active" }),
      Subscription.countDocuments({ status: "paused" }),
      Subscription.countDocuments({ status: "cancelled" }),
      Order.countDocuments(todayMatch),
      productObjectId
        ? Order.aggregate([
            ...itemPipelineBase,
            { $match: { createdAt: { $gte: startOfToday, $lt: endOfToday } } },
            { $group: { _id: null, total: { $sum: "$itemRevenue" } } },
          ])
        : Order.aggregate([
            { $match: todayMatch },
            { $group: { _id: null, total: { $sum: "$totalAmount" } } },
          ]),
      Order.aggregate(revenueTrendPipeline),
      Order.aggregate(ordersTrendPipeline),
      Order.aggregate(topProductsPipeline),
      Order.aggregate(topCustomersPipeline),
      Order.aggregate(customerOptionsPipeline),
      Product.find({ stock: { $type: "number", $lt: 5 } }).select(
        "_id name stock price category image"
      ),
    ]);

    return res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        totalProducts,
        totalOrders,
        totalRevenue: totalRevenueAgg[0]?.total || 0,
        activeSubscriptions,
        subscriptionStatus: {
          active: activeSubscriptions,
          paused: pausedSubscriptions,
          cancelled: cancelledSubscriptions,
        },
        todayOrders,
        todayRevenue: todayRevenueAgg[0]?.total || 0,
        revenueTrend,
        ordersTrend,
        topProducts,
        topCustomers,
        customerOptions,
        lowStockProducts,
      },
    });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};

const getAnalyticsOverview = async (req, res, next) => {
  try {
    console.log("Analytics route hit");
    const context = buildAnalyticsContext(req.query);
    const { productObjectId, userObjectId, orderMatch, itemPipelineBase } = context;

    const revenueTrendPipeline = buildRevenueTrendPipeline({
      productObjectId,
      orderMatch,
      itemPipelineBase,
    });
    const ordersTrendPipeline = buildOrdersTrendPipeline({ orderMatch });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const todayMatch = {
      ...(userObjectId ? { user: userObjectId } : {}),
      ...(productObjectId ? { "orderItems.product": productObjectId } : {}),
      createdAt: { $gte: startOfToday, $lt: endOfToday },
    };

    const [
      totalUsers,
      totalProducts,
      totalOrders,
      totalRevenueAgg,
      activeSubscriptions,
      pausedSubscriptions,
      cancelledSubscriptions,
      todayOrders,
      todayRevenueAgg,
      revenueTrend,
      ordersTrend,
      lowStockProducts,
    ] = await Promise.all([
      User.countDocuments(),
      Product.countDocuments(),
      Order.countDocuments(orderMatch),
      productObjectId
        ? Order.aggregate([
            ...itemPipelineBase,
            { $group: { _id: null, total: { $sum: "$itemRevenue" } } },
          ])
        : Order.aggregate([
            { $match: orderMatch },
            { $group: { _id: null, total: { $sum: "$totalAmount" } } },
          ]),
      Subscription.countDocuments({ status: "active" }),
      Subscription.countDocuments({ status: "paused" }),
      Subscription.countDocuments({ status: "cancelled" }),
      Order.countDocuments(todayMatch),
      productObjectId
        ? Order.aggregate([
            ...itemPipelineBase,
            { $match: { createdAt: { $gte: startOfToday, $lt: endOfToday } } },
            { $group: { _id: null, total: { $sum: "$itemRevenue" } } },
          ])
        : Order.aggregate([
            { $match: todayMatch },
            { $group: { _id: null, total: { $sum: "$totalAmount" } } },
          ]),
      Order.aggregate(revenueTrendPipeline),
      Order.aggregate(ordersTrendPipeline),
      Product.find({ stock: { $type: "number", $lt: 5 } }).select(
        "_id name stock price category image"
      ),
    ]);

    return res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        totalProducts,
        totalOrders,
        totalRevenue: totalRevenueAgg[0]?.total || 0,
        activeSubscriptions,
        subscriptionStatus: {
          active: activeSubscriptions,
          paused: pausedSubscriptions,
          cancelled: cancelledSubscriptions,
        },
        todayOrders,
        todayRevenue: todayRevenueAgg[0]?.total || 0,
        revenueTrend,
        ordersTrend,
        lowStockProducts,
      },
    });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};

const getAnalyticsTrends = async (req, res, next) => {
  try {
    const context = buildAnalyticsContext(req.query);
    const { productObjectId, orderMatch, itemPipelineBase } = context;

    const revenueTrendPipeline = buildRevenueTrendPipeline({
      productObjectId,
      orderMatch,
      itemPipelineBase,
    });
    const ordersTrendPipeline = buildOrdersTrendPipeline({ orderMatch });

    const [revenueTrend, ordersTrend] = await Promise.all([
      Order.aggregate(revenueTrendPipeline),
      Order.aggregate(ordersTrendPipeline),
    ]);

    return res.status(200).json({
      success: true,
      trends: {
        revenueTrend,
        ordersTrend,
      },
    });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};

const getAnalyticsTopProducts = async (req, res, next) => {
  try {
    const context = buildAnalyticsContext(req.query);
    const { itemPipelineBase } = context;

    const topProducts = await Order.aggregate(
      buildTopProductsPipeline({ itemPipelineBase })
    );

    return res.status(200).json({
      success: true,
      items: topProducts,
    });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};

const getAnalyticsTopCustomers = async (req, res, next) => {
  try {
    const context = buildAnalyticsContext(req.query);
    const { dateRange, productObjectId, orderMatch, itemPipelineBase } = context;

    const topCustomersPipeline = buildTopCustomersPipeline({
      productObjectId,
      orderMatch,
      itemPipelineBase,
    });
    const customerOptionsPipeline = buildCustomerOptionsPipeline({
      dateRange,
      productObjectId,
    });

    const [topCustomers, customerOptions] = await Promise.all([
      Order.aggregate(topCustomersPipeline),
      Order.aggregate(customerOptionsPipeline),
    ]);

    return res.status(200).json({
      success: true,
      items: topCustomers,
      customerOptions,
    });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};

const getAnalyticsExport = async (req, res, next) => {
  try {
    const type = String(req.query.type || "").trim().toLowerCase();
    if (!EXPORT_TYPES.includes(type)) {
      return res.status(400).json({ message: "Invalid export type" });
    }

    const context = buildAnalyticsContext(req.query);
    const {
      dateRange,
      productObjectId,
      userObjectId,
      orderMatch,
      itemPipelineBase,
    } = context;

    if (type === "orders") {
      const orders = await Order.find(orderMatch)
        .select("orderItems totalAmount status isPaid createdAt user")
        .populate("user", "name email")
        .populate("orderItems.product", "name")
        .sort({ createdAt: -1 })
        .lean();

      const rows = orders.map((order) => [
        order?._id || "",
        order?.user?.email || order?.user?.name || "",
        (Array.isArray(order?.orderItems) ? order.orderItems : [])
          .map((item) => item?.product?.name || "Unknown product")
          .join(" | "),
        Number(order?.totalAmount || 0).toFixed(2),
        order?.status || "",
        order?.isPaid ? "Paid" : "Pending",
        order?.createdAt ? new Date(order.createdAt).toISOString() : "",
      ]);

      return sendCsvResponse(
        res,
        buildCsv(
          [
            "Order ID",
            "Customer",
            "Product(s)",
            "Total Amount",
            "Status",
            "Payment Status",
            "Created Date",
          ],
          rows
        )
      );
    }

    if (type === "revenue") {
      const revenueTrendPipeline = buildRevenueTrendPipeline({
        productObjectId,
        orderMatch,
        itemPipelineBase,
      });
      const ordersTrendPipeline = buildOrdersTrendPipeline({ orderMatch });

      const [revenueData, ordersData] = await Promise.all([
        Order.aggregate(revenueTrendPipeline),
        Order.aggregate(ordersTrendPipeline),
      ]);

      const monthMap = new Map();

      for (const entry of revenueData) {
        const key = `${entry?._id?.year}-${entry?._id?.month}`;
        monthMap.set(key, {
          year: entry?._id?.year,
          month: entry?._id?.month,
          revenue: Number(entry?.value || 0),
          orderCount: 0,
        });
      }

      for (const entry of ordersData) {
        const key = `${entry?._id?.year}-${entry?._id?.month}`;
        const existing = monthMap.get(key) || {
          year: entry?._id?.year,
          month: entry?._id?.month,
          revenue: 0,
          orderCount: 0,
        };
        existing.orderCount = Number(entry?.value || 0);
        monthMap.set(key, existing);
      }

      const rows = [...monthMap.values()]
        .sort((a, b) => {
          const aValue = Number(a.year) * 100 + Number(a.month);
          const bValue = Number(b.year) * 100 + Number(b.month);
          return aValue - bValue;
        })
        .map((entry) => [
          toMonthLabel(entry.year, entry.month),
          entry.revenue.toFixed(2),
          String(entry.orderCount),
        ]);

      return sendCsvResponse(res, buildCsv(["Month", "Revenue", "Order Count"], rows));
    }

    const subscriptionMatch = {};
    if (dateRange) {
      subscriptionMatch.createdAt = dateRange;
    }
    if (userObjectId) {
      subscriptionMatch.user = userObjectId;
    }
    if (productObjectId) {
      subscriptionMatch.product = productObjectId;
    }

    const subscriptions = await Subscription.find(subscriptionMatch)
      .select("user product status quantity startDate nextDeliveryDate createdAt")
      .populate("user", "name email")
      .populate("product", "name price")
      .sort({ createdAt: -1 })
      .lean();

    const rows = subscriptions.map((subscription) => {
      const quantity = Number(subscription?.quantity || 0);
      const unitPrice = Number(subscription?.product?.price || 0);
      const amount = quantity * unitPrice;

      return [
        subscription?._id || "",
        subscription?.user?.email || subscription?.user?.name || "",
        subscription?.product?.name || "",
        subscription?.status || "",
        amount.toFixed(2),
        subscription?.startDate ? new Date(subscription.startDate).toISOString() : "",
        subscription?.nextDeliveryDate
          ? new Date(subscription.nextDeliveryDate).toISOString()
          : "",
      ];
    });

    return sendCsvResponse(
      res,
      buildCsv(
        [
          "Subscription ID",
          "Customer",
          "Product",
          "Status",
          "Amount",
          "Start Date",
          "Next Billing Date",
        ],
        rows
      )
    );
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return next(error);
  }
};

const getAuditLogs = async (req, res, next) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100);
    const skip = (page - 1) * limit;

    const { admin: adminQuery, adminId, entityType, startDate, endDate } = req.query;
    const adminFilterValue = adminQuery || adminId;

    const filter = {};

    if (adminFilterValue) {
      if (!mongoose.Types.ObjectId.isValid(adminFilterValue)) {
        return res.status(400).json({ message: "Invalid admin value" });
      }
      filter.admin = adminFilterValue;
    }

    if (entityType) {
      if (!AUDIT_ENTITY_TYPES.includes(entityType)) {
        return res.status(400).json({ message: "Invalid entityType value" });
      }
      filter.entity = entityType;
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

    const [total, items, admins] = await Promise.all([
      AuditLog.countDocuments(filter),
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("admin", "name email")
        .lean(),
      User.find({ role: "admin" }).select("name email").sort({ email: 1 }).lean(),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit) || 1);

    return res.status(200).json({
      items: items.map((log) => ({
        ...log,
        adminId: log.admin,
        entityType: log.entity,
      })),
      admins,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAnalytics,
  getAnalyticsOverview,
  getAnalyticsTrends,
  getAnalyticsTopProducts,
  getAnalyticsTopCustomers,
  getAnalyticsExport,
  getAuditLogs,
};
