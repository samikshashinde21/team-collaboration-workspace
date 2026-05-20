const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const http = require("http");
const { Server } = require("socket.io");

const connectDB = require("./config/db");
const activityRoutes = require("./routes/activityRoutes");
const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const invitationRoutes = require("./routes/invitationRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const roomRoutes = require("./routes/roomRoutes");
const unreadRoutes = require("./routes/unreadRoutes");
const userRoutes = require("./routes/userRoutes");
const socketHandler = require("./sockets/socketHandler");

dotenv.config();
connectDB();

const app = express();
const server = http.createServer(app);
const apiRateLimitWindowMs = Number(process.env.API_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const apiRateLimitMax = Number(process.env.API_RATE_LIMIT_MAX) || 2000;
const authRateLimitMax = Number(process.env.AUTH_RATE_LIMIT_MAX) || 50;

const io = new Server(server, {
  cors: {
origin: [
  "http://localhost:5173",
  "https://team-collaboration-workspace.vercel.app",
],
    methods: ["GET", "POST", "PATCH", "DELETE"],
  },
});

app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://team-collaboration-workspace.vercel.app",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(helmet());

app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);

const apiLimiter = rateLimit({
  windowMs: apiRateLimitWindowMs,
  max: apiRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",
  message: { message: "Too many requests. Please wait a moment and try again." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",
  message: { message: "Too many authentication attempts. Please try again later." },
});

app.use("/api", apiLimiter);
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/invitations", invitationRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/unread-counts", unreadRoutes);
app.use("/api/users", userRoutes);

app.get("/", (req, res) => {
  res.send("CollabSpace API running");
});

app.set("io", io);
socketHandler(io);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
