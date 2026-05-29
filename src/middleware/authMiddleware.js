const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
  let token;

  console.log(`[auth] ${req.method} ${req.originalUrl} - auth check started`);

  if (!process.env.JWT_SECRET) {
    console.error("[auth] JWT_SECRET is not set");
    return res.status(500).json({ message: "JWT secret is not configured" });
  }

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      console.log("[auth] Bearer token received");

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log(`[auth] Token verified for user ${decoded.id}`);

      // get full user from DB
      const user = await User.findById(decoded.id).select("-password");

      if (!user) {
        console.warn(`[auth] Token decoded, but user not found for id ${decoded.id}`);
        return res.status(401).json({ message: "User not found" });
      }

      req.user = user;
      req.userRole = user.role;
      console.log(`[auth] Authenticated user ${user.email} (${user.role})`);
      
      next();

    } catch (error) {
      console.warn(`[auth] Token validation failed: ${error.message}`);
      return res.status(401).json({ message: "Not authorized, token failed" });
    }
  } else {
    console.warn("[auth] No bearer token provided");
    return res.status(401).json({ message: "No token provided" });
  }
};

module.exports = protect;
