require("dotenv").config();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const User = require("../src/models/User");

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const demoUsers = [
  {
    name: "Admin User",
    email: "admin@gmail.com",
    password: "admin123",
    role: "admin",
    tier: "premium",
  },
  {
    name: "Normal User",
    email: "user@gmail.com",
    password: "user123",
    role: "user",
    tier: "free",
  },
];

const ensureDemoUser = async ({ name, email, password, role, tier }) => {
  const normalizedEmail = normalizeEmail(email);
  const existingUser = await User.findOne({ email: normalizedEmail });

  if (existingUser) {
    console.log(`[seed-auth] Existing ${role} user found: ${normalizedEmail}`);
    return existingUser;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const createdUser = await User.create({
    name,
    email: normalizedEmail,
    password: hashedPassword,
    role,
    tier,
  });

  console.log(`[seed-auth] Created ${role} user: ${normalizedEmail}`);
  return createdUser;
};

async function main() {
  const connected = await connectDB();

  if (!connected) {
    console.error("[seed-auth] Aborting because MongoDB is unavailable.");
    process.exitCode = 1;
    return;
  }

  const usersBefore = await User.find({}).select("email role tier createdAt updatedAt").sort({ role: 1, email: 1 });
  console.log(`[seed-auth] Users before seed: ${usersBefore.length}`);
  usersBefore.forEach((user) => {
    console.log(`[seed-auth] - ${user.email} | ${user.role} | ${user.tier}`);
  });

  for (const user of demoUsers) {
    await ensureDemoUser(user);
  }

  const usersAfter = await User.find({}).select("email role tier createdAt updatedAt").sort({ role: 1, email: 1 });
  console.log(`[seed-auth] Users after seed: ${usersAfter.length}`);
  usersAfter.forEach((user) => {
    console.log(`[seed-auth] - ${user.email} | ${user.role} | ${user.tier}`);
  });

  await mongoose.disconnect();
  console.log("[seed-auth] Done.");
}

main().catch((error) => {
  console.error(`[seed-auth] Failed: ${error.message}`);
  process.exitCode = 1;
});