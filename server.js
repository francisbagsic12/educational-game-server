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

// === RANK SYSTEM (SAME AS FRONTEND) ===
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
app.use(
  cors({
    origin: "*", // Dev only! Change to your domain in production
  })
);
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

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  xp: { type: Number, default: 0 },
  avatar: { type: String, default: "Superhero" },
  country: { type: String, default: "PH" },

  // NEW FIELDS
  currentRank: { type: String, default: "Beginner" },
  leaderboardPosition: { type: Number, default: null }, // null = not ranked yet
});
const User = mongoose.model("User", userSchema);

// Middleware: Verify JWT
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
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

// === UPDATE USER (XP & Avatar) ===
app.post("/api/update", authenticate, async (req, res) => {
  try {
    const { xp, avatar } = req.body;

    if (xp !== undefined) req.user.xp = xp;
    if (avatar) req.user.avatar = avatar;

    await req.user.save();
    const rank = getRank(req.user.xp);

    res.json({
      xp: req.user.xp,
      avatar: req.user.avatar,
      level: Math.floor(req.user.xp / 50) + 1,
      rank: rank.name,
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
  });
});

// === LEADERBOARD: TOP 10 BY RANK + XP ===
app.get("/api/leaderboard", authenticate, async (req, res) => {
  try {
    const users = await User.find()
      .select("username xp avatar")
      .sort({ xp: -1 })
      .limit(10);

    const leaderboard = users.map((user) => {
      const rank = getRank(user.xp);
      return {
        _id: user._id,
        username: user.username,
        xp: user.xp,
        avatar: user.avatar,
        level: Math.floor(user.xp / 50) + 1,
        rank: rank.name,
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
  res.json({ msg: "Super Quiz Hero API is LIVE!" });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Deploy URL: https://your-app.onrender.com`);
});
