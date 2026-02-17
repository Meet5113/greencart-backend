const Order = require("../models/Order");
const Product = require("../models/Product");
const Subscription = require("../models/Subscription");
const User = require("../models/User");

const getAnalytics = async (req, res, next) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const [
      totalUsers,
      totalProducts,
      totalOrders,
      totalRevenueAgg,
      activeSubscriptions,
      todayOrders,
      todayRevenueAgg,
      lowStockProducts,
    ] = await Promise.all([
      User.countDocuments(),
      Product.countDocuments(),
      Order.countDocuments(),
      Order.aggregate([{ $group: { _id: null, total: { $sum: "$totalAmount" } } }]),
      Subscription.countDocuments({ status: "active" }),
      Order.countDocuments({ createdAt: { $gte: startOfToday, $lt: endOfToday } }),
      Order.aggregate([
        { $match: { createdAt: { $gte: startOfToday, $lt: endOfToday } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
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
        todayOrders,
        todayRevenue: todayRevenueAgg[0]?.total || 0,
        lowStockProducts,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getAnalytics };
