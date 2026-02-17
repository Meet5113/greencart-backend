const mongoose = require("mongoose");

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.error("MONGO_URI is missing. Add it to backend/.env");
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("MongoDB connection failed.");

    if (error.message.includes("querySrv ENOTFOUND")) {
      console.error(
        "Atlas DNS lookup failed. Check your cluster URI and network DNS access."
      );
    }

    if (error.message.includes("Authentication failed")) {
      console.error(
        "Atlas authentication failed. Check username/password in MONGO_URI."
      );
    }

    if (error.message.includes("IP") || error.message.includes("whitelist")) {
      console.error(
        "Atlas network access issue. Ensure your current IP is allowed."
      );
    }

    console.error(`Details: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
