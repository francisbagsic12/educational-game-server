// server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "superquizhero-secret-key-2025";

// === RANK SYSTEM ===
const RANKS = [
  { name: "Bronze I", min: 0, difficulty: "easy" },
  { name: "Bronze II", min: 100, difficulty: "easy" },
  { name: "Bronze III", min: 200, difficulty: "easy" },
  { name: "Silver I", min: 300, difficulty: "medium" },
  { name: "Silver II", min: 500, difficulty: "medium" },
  { name: "Silver III", min: 700, difficulty: "medium" },
  { name: "Gold I", min: 1000, difficulty: "hard" },
  { name: "Gold II", min: 1500, difficulty: "hard" },
  { name: "Gold III", min: 2000, difficulty: "hard" },
  { name: "Platinum I", min: 3000, difficulty: "expert" },
  { name: "Platinum II", min: 4000, difficulty: "expert" },
  { name: "Platinum III", min: 5000, difficulty: "expert" },
  { name: "Diamond I", min: 7000, difficulty: "master" },
  { name: "Diamond II", min: 9000, difficulty: "master" },
  { name: "Diamond III", min: 12000, difficulty: "master" },
  { name: "Master", min: 15000, difficulty: "legend" },
  { name: "Grandmaster", min: 20000, difficulty: "legend" },
  { name: "Legend", min: 30000, difficulty: "legend" },
];

const getRank = (xp) => {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (xp >= RANKS[i].min) return RANKS[i];
  }
  return RANKS[0];
};

// Middleware
app.use(cors({ origin: "*" })); // Dev only
app.use(express.json());

// MongoDB Connection
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB Atlas Connected!"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

// === ACHIEVEMENTS DATA (SERVER-SIDE) ===
const ACHIEVEMENTS = [
  { id: "first_win", xpReward: 50 },
  { id: "streak_3", xpReward: 100 },
  { id: "perfect_score", xpReward: 150 },
  { id: "speed_demon", xpReward: 120 },
  { id: "math_master", xpReward: 200 },
  { id: "level_50", xpReward: 500 },
  { id: "level_100", xpReward: 1000 },
  { id: "level_200", xpReward: 2500 },
  { id: "gold_rank", xpReward: 800 },
  { id: "platinum_rank", xpReward: 1200 },
  { id: "diamond_rank", xpReward: 2000 },
  { id: "master_rank", xpReward: 3000 },
  { id: "legend", xpReward: 5000 },
];

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  xp: { type: Number, default: 0 },
  avatar: { type: String, default: "Superhero" },
  country: { type: String, default: "PH" },

  // ACHIEVEMENTS
  achievements: { type: [String], default: [] },
  streak: { type: Number, default: 0 },
  lastPlayed: { type: Date },
  categoryProgress: {
    type: Map,
    of: Number,
    default: () => new Map(),
  },
});
const User = mongoose.model("User", userSchema);

// Middleware: Authenticate
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ msg: "No token" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");
    if (!req.user) return res.status(404).json({ msg: "User not found" });
    next();
  } catch (err) {
    res.status(401).json({ msg: "Invalid token" });
  }
};

// === REGISTER ===
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).json({ msg: "Missing fields" });
  if (username.length < 3)
    return res.status(400).json({ msg: "Username too short" });
  if (password.length < 6)
    return res.status(400).json({ msg: "Password too short" });

  try {
    const existing = await User.findOne({ username: username.toLowerCase() });
    if (existing) return res.status(400).json({ msg: "Username taken" });

    const hashed = await bcrypt.hash(password, 12);
    const user = new User({
      username: username.toLowerCase(),
      password: hashed,
    });
    await user.save();

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });
    const rank = getRank(user.xp);

    res.json({
      token,
      user: {
        username: user.username,
        xp: user.xp,
        avatar: user.avatar,
        level: Math.floor(user.xp / 50) + 1,
        rank: rank.name,
        achievements: user.achievements,
      },
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

// === LOGIN ===
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) return res.status(400).json({ msg: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ msg: "Invalid credentials" });

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });
    const rank = getRank(user.xp);

    res.json({
      token,
      user: {
        username: user.username,
        xp: user.xp,
        avatar: user.avatar,
        level: Math.floor(user.xp / 50) + 1,
        rank: rank.name,
        achievements: user.achievements,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

// === UPDATE USER (XP, Avatar, Achievements) ===
app.post("/api/update", authenticate, async (req, res) => {
  try {
    const { xp, avatar, achievementId, category, timeTaken, isPerfect } =
      req.body;

    // Update XP
    if (xp !== undefined) req.user.xp = xp;

    // Update Avatar
    if (avatar) req.user.avatar = avatar;

    // === ACHIEVEMENT UNLOCK LOGIC ===
    const unlocked = [];

    // Manual achievement (e.g., first_win)
    if (achievementId && !req.user.achievements.includes(achievementId)) {
      const ach = ACHIEVEMENTS.find((a) => a.id === achievementId);
      if (ach) {
        req.user.achievements.push(achievementId);
        req.user.xp += ach.xpReward;
        unlocked.push({ id: achievementId, xpReward: ach.xpReward });
      }
    }

    // === LEVEL ACHIEVEMENTS ===
    const level = Math.floor(req.user.xp / 50) + 1;
    if (level >= 50 && !req.user.achievements.includes("level_50")) {
      req.user.achievements.push("level_50");
      req.user.xp += 500;
      unlocked.push({ id: "level_50", xpReward: 500 });
    }
    if (level >= 100 && !req.user.achievements.includes("level_100")) {
      req.user.achievements.push("level_100");
      req.user.xp += 1000;
      unlocked.push({ id: "level_100", xpReward: 1000 });
    }
    if (level >= 200 && !req.user.achievements.includes("level_200")) {
      req.user.achievements.push("level_200");
      req.user.xp += 2500;
      unlocked.push({ id: "level_200", xpReward: 2500 });
    }

    // === RANK ACHIEVEMENTS ===
    const rankName = getRank(req.user.xp).name;
    const rankTier = rankName.split(" ")[0];

    if (
      ["Gold I", "Gold II", "Gold III"].includes(rankName) &&
      !req.user.achievements.includes("gold_rank")
    ) {
      req.user.achievements.push("gold_rank");
      req.user.xp += 800;
      unlocked.push({ id: "gold_rank", xpReward: 800 });
    }
    if (
      rankTier === "Platinum" &&
      !req.user.achievements.includes("platinum_rank")
    ) {
      req.user.achievements.push("platinum_rank");
      req.user.xp += 1200;
      unlocked.push({ id: "platinum_rank", xpReward: 1200 });
    }
    if (
      rankTier === "Diamond" &&
      !req.user.achievements.includes("diamond_rank")
    ) {
      req.user.achievements.push("diamond_rank");
      req.user.xp += 2000;
      unlocked.push({ id: "diamond_rank", xpReward: 2000 });
    }
    if (
      rankTier === "Master" &&
      !req.user.achievements.includes("master_rank")
    ) {
      req.user.achievements.push("master_rank");
      req.user.xp += 3000;
      unlocked.push({ id: "master_rank", xpReward: 3000 });
    }
    if (rankName === "Legend" && !req.user.achievements.includes("legend")) {
      req.user.achievements.push("legend");
      req.user.xp += 5000;
      unlocked.push({ id: "legend", xpReward: 5000 });
    }

    // === STREAK UPDATE ===
    const today = new Date().setHours(0, 0, 0, 0);
    const last = req.user.lastPlayed
      ? new Date(req.user.lastPlayed).setHours(0, 0, 0, 0)
      : 0;

    if (today !== last) {
      if (today - last === 86400000) {
        req.user.streak += 1;
      } else {
        req.user.streak = 1;
      }
      req.user.lastPlayed = new Date();

      if (
        req.user.streak === 3 &&
        !req.user.achievements.includes("streak_3")
      ) {
        const ach = ACHIEVEMENTS.find((a) => a.id === "streak_3");
        req.user.achievements.push("streak_3");
        req.user.xp += ach.xpReward;
        unlocked.push({ id: "streak_3", xpReward: ach.xpReward });
      }
    }

    // === CATEGORY PROGRESS (e.g., Math Master) ===
    if (category) {
      const count = (req.user.categoryProgress.get(category) || 0) + 1;
      req.user.categoryProgress.set(category, count);

      if (
        category === "Math" &&
        count >= 5 &&
        !req.user.achievements.includes("math_master")
      ) {
        const ach = ACHIEVEMENTS.find((a) => a.id === "math_master");
        req.user.achievements.push("math_master");
        req.user.xp += ach.xpReward;
        unlocked.push({ id: "math_master", xpReward: ach.xpReward });
      }
    }

    // === SPEED DEMON & PERFECT SCORE ===
    if (
      timeTaken !== undefined &&
      timeTaken < 10 &&
      !req.user.achievements.includes("speed_demon")
    ) {
      const ach = ACHIEVEMENTS.find((a) => a.id === "speed_demon");
      req.user.achievements.push("speed_demon");
      req.user.xp += ach.xpReward;
      unlocked.push({ id: "speed_demon", xpReward: ach.xpReward });
    }
    if (isPerfect && !req.user.achievements.includes("perfect_score")) {
      const ach = ACHIEVEMENTS.find((a) => a.id === "perfect_score");
      req.user.achievements.push("perfect_score");
      req.user.xp += ach.xpReward;
      unlocked.push({ id: "perfect_score", xpReward: ach.xpReward });
    }

    await req.user.save();
    const rank = getRank(req.user.xp);

    res.json({
      xp: req.user.xp,
      avatar: req.user.avatar,
      level: Math.floor(req.user.xp / 50) + 1,
      rank: rank.name,
      achievements: req.user.achievements,
      unlockedAchievements: unlocked, // For confetti
    });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

// === GET USER PROFILE ===
app.get("/api/profile", authenticate, (req, res) => {
  const rank = getRank(req.user.xp);
  res.json({
    username: req.user.username,
    xp: req.user.xp,
    avatar: req.user.avatar,
    level: Math.floor(req.user.xp / 50) + 1,
    rank: rank.name,
    achievements: req.user.achievements,
  });
});

// === LEADERBOARD ===
app.get("/api/leaderboard", authenticate, async (req, res) => {
  try {
    const users = await User.find()
      .select("username xp avatar achievements")
      .sort({ xp: -1 })
      .limit(10);

    const leaderboard = users.map((user, index) => {
      const rank = getRank(user.xp);
      return {
        position: index + 1,
        username: user.username,
        xp: user.xp,
        avatar: user.avatar,
        level: Math.floor(user.xp / 50) + 1,
        rank: rank.name,
        achievements: user.achievements,
      };
    });

    res.json(leaderboard);
  } catch (err) {
    console.error("Leaderboard error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

// Health Check
app.get("/", (req, res) => {
  res.json({ msg: "BrightMinds API is LIVE! (Nov 11, 2025)" });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Deploy URL: https://your-app.onrender.com`);
});
