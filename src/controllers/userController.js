const bcrypt = require("bcryptjs");
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const Invite = require("../models/Invite");
const Quiz = require("../models/Quiz");
const Attempt = require("../models/Attempt");
const mongoose = require("mongoose");

const allowedTiers = ["free", "pro", "premium"];
const isDatabaseReady = () => mongoose.connection.readyState === 1;
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

// @desc   Create new user
// @route  POST /api/users
exports.createUser = async (req, res) => {
  try {
  if (!isDatabaseReady()) {
   console.warn("[auth:register] Database unavailable during registration");
   return res.status(503).json({ message: "Database unavailable. Please try again later." });
  }

   const { name, email, password, role, inviteCode } = req.body;
const normalizedEmail = normalizeEmail(email);
console.log(`[auth:register] Incoming registration email=${normalizedEmail}, role=${role || "user"}`);

const userExists = await User.findOne({ email: normalizedEmail });
if (userExists) {
  console.log(`[auth:register] User already exists for ${normalizedEmail}`);
  return res.status(400).json({ message: "User already exists" });
}
// ✅ Only check invite for NORMAL USERS
if (role !== "admin") {
  if (!inviteCode) {
    return res.status(400).json({ message: "Invite code required" });
  }

  const invite = await Invite.findOne({ code: inviteCode });

  if (!invite || invite.used) {
    return res.status(400).json({ message: "Invalid invite code" });
  }

  invite.used = true;
  await invite.save();
}

    // ✅ Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // ✅ Create user
    const requestedTier = allowedTiers.includes(req.body.tier) ? req.body.tier : "free";

    const user = await User.create({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role: role || "user",
      tier: requestedTier
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      skills: user.skills || [],
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.loginUser = async (req, res) => {
  try {
    if (!isDatabaseReady()) {
      console.warn("[auth:login] Database unavailable during login");
      return res.status(503).json({ message: "Database unavailable. Please try again later." });
    }

    if (!process.env.JWT_SECRET) {
      console.error("[auth:login] JWT_SECRET is not set");
      return res.status(500).json({ message: "JWT secret is not configured" });
    }

    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);
    console.log(`[auth:login] Incoming login email=${normalizedEmail}`);

    // 1️⃣ Check email exists
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      console.log(`[auth:login] User not found for ${normalizedEmail}`);
      return res.status(400).json({ message: "User not found" });
    }

    console.log(`[auth:login] User found ${user.email} (${user.role})`);

    // 2️⃣ Compare password (plain vs hash)
    const isMatch = await bcrypt.compare(password, user.password);
    console.log(`[auth:login] Password match for ${normalizedEmail}: ${isMatch}`);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid password" });
    }

    // 3️⃣ Generate Token
    const token = jwt.sign(
    { id: user._id,role:user.role },
    process.env.JWT_SECRET,
  { expiresIn: "1d" }
);
    console.log(`[auth:login] JWT generated for ${normalizedEmail}`);

// 4️⃣ Success response with token
  res.status(200).json({
  message: "Login successful",
  token,
  user: {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    tier: user.tier,
    skills: user.skills || []
  }
 });
} catch (error) {
    res.status(500).json({ message: error.message });
  }
};


exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ role: "user" }).select("name email role tier skills");
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAdminOverview = async (req, res) => {
  try {
    const [totalUsers, totalQuizzes, attempts] = await Promise.all([
      User.countDocuments({ role: "user" }),
      Quiz.countDocuments(),
      Attempt.find().select("score total")
    ]);

    const totalAttempts = attempts.length;
    let averageScore = 0;

    if (totalAttempts > 0) {
      const percentages = attempts
        .map((attempt) => {
          if (attempt.total && attempt.total > 0) {
            return (Number(attempt.score) / Number(attempt.total)) * 100;
          }
          return Number(attempt.score);
        })
        .filter((value) => Number.isFinite(value));

      if (percentages.length > 0) {
        averageScore = percentages.reduce((sum, value) => sum + value, 0) / percentages.length;
      }
    }

    res.json({
      totalUsers,
      totalQuizzes,
      totalAttempts,
      averageScore: Number(averageScore.toFixed(1))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateUserTier = async (req, res) => {
  try {
    const { tier } = req.body;

    if (!allowedTiers.includes(tier)) {
      return res.status(400).json({ message: "Invalid tier" });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.tier = tier;
    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      tier: updatedUser.tier,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.name = req.body.name || user.name;
    user.email = req.body.email ? normalizeEmail(req.body.email) : user.email;
    if (req.body.skills !== undefined) {
      user.skills = Array.isArray(req.body.skills)
        ? req.body.skills
        : String(req.body.skills || "")
            .split(/[\n,]/)
            .map((skill) => skill.trim())
            .filter(Boolean);
    }

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      skills: updatedUser.skills || [],
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateUserSkills = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.skills = Array.isArray(req.body.skills)
      ? req.body.skills
      : String(req.body.skills || "")
          .split(/[\n,]/)
          .map((skill) => skill.trim())
          .filter(Boolean);

    const updatedUser = await user.save();
    res.json({
      _id: updatedUser._id,
      skills: updatedUser.skills || [],
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};