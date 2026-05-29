require("dotenv").config();
const path = require("path");
const express = require("express"); // ✅ ADD THIS
const connectDB = require("./src/config/db");
const app = require("./src/app");

// ✅ Serve PDF certificates with explicit MIME + inline viewer (avoids OS/text-editor opens)
const certificatesRoot = path.join(__dirname, "certificates");
app.use(
  "/certificates",
  express.static(certificatesRoot, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".pdf")) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${path.basename(filePath)}"`
        );
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        res.setHeader(
          "Cache-Control",
          "private, no-cache, no-store, must-revalidate"
        );
        res.setHeader("Pragma", "no-cache");
      }
    },
  })
);

const studyMaterialsRoot = path.join(__dirname, "study-materials");
app.use(
  "/study-materials",
  express.static(studyMaterialsRoot, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".pdf")) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${path.basename(filePath)}"`
        );
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      }
    },
  })
);

const PORT = process.env.PORT || 5000;

if (!process.env.JWT_SECRET) {
  console.warn("[config] JWT_SECRET is not set. Login token generation and auth verification will fail.");
}

async function startServer() {
  const dbConnected = await connectDB();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    if (!dbConnected) {
      console.warn("MongoDB is unavailable, so database-backed API routes will fail until the connection is restored.");
    }
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});