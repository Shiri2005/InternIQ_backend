const express = require("express");
const path = require("path");
const cors = require("cors");

const userRoutes = require("./routes/userRoutes");
const taskRoutes = require("./routes/taskRoutes");
const inviteRoutes = require("./routes/inviteRoutes");
const projectRoutes = require("./routes/projectRoutes");
const submissionRoutes = require("./routes/submissionRoutes");
const app = express();
const quizRoutes = require("./routes/quizRoutes");
const studyMaterialRoutes = require("./routes/studyMaterialRoutes");
const aiRoutes = require("./routes/aiRoutes");

app.use(cors());
app.use(express.json());

const studyMaterialsRoot = path.join(__dirname, "..", "study-materials");
app.use(
  "/study-materials",
  express.static(studyMaterialsRoot, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".pdf")) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${path.basename(filePath)}"`);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      }
    }
  })
);

// Routes
app.use("/api/users", userRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/invites", inviteRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/study-materials", studyMaterialRoutes);
app.use("/api/ai", aiRoutes);
// Backward-compatible aliases for cached frontend bundles that still call legacy root paths.
app.use("/users", userRoutes);
app.use("/quiz", quizRoutes);
app.use("/quizzes", quizRoutes);
app.use("/tasks", taskRoutes);
app.use("/invites", inviteRoutes);
app.use("/projects", projectRoutes);
app.use("/submissions", submissionRoutes);
app.use("/study-materials", studyMaterialRoutes);
app.use("/ai", aiRoutes);
// Test route
app.get("/", (req, res) => {
  res.send("Cynaris Backend Running");
});

module.exports = app;