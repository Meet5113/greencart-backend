require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const connectDB = require("../config/db");
const User = require("../models/User");

const ADMIN_EMAIL = "vaghamshimeet05@gmail.com";
const ADMIN_PASSWORD = "Admin@123";
const ADMIN_ROLE = "admin";
const ADMIN_NAME = "Admin";

const isBcryptHash = (value) => /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value || "");

const createOrUpdateAdmin = async () => {
  await connectDB();

  const email = ADMIN_EMAIL.toLowerCase();
  let user = await User.findOne({ email });

  if (!user) {
    user = new User({
      name: ADMIN_NAME,
      email,
      password: ADMIN_PASSWORD,
      role: ADMIN_ROLE,
    });
  } else {
    user.name = user.name || ADMIN_NAME;
    user.role = ADMIN_ROLE;
    user.password = ADMIN_PASSWORD;
  }

  await user.save();

  const persisted = await User.findById(user._id).select("email role password").lean();

  if (!persisted || persisted.role !== ADMIN_ROLE) {
    throw new Error("Admin role verification failed.");
  }

  if (!isBcryptHash(persisted.password)) {
    throw new Error("Password hash verification failed.");
  }

  const passwordMatches = await bcrypt.compare(ADMIN_PASSWORD, persisted.password);

  if (!passwordMatches) {
    throw new Error("Password validation failed.");
  }

  process.stdout.write("Admin ready\n");
};

createOrUpdateAdmin()
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });