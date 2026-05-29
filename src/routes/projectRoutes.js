const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");
const checkTier = require("../middleware/checkTier");
const Project = require("../models/Project");
const Task = require("../models/Task");

const {
  createProject,
  getProjects,
  getMyProjects,
  getProjectById,
  getProjectReadiness,
  analyzeProjectResume,
  updateProject,
  deleteProject,
} = require("../controllers/projectController");

const resumeStoragePath = path.join(__dirname, "../../uploads/project-resumes");
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(resumeStoragePath, { recursive: true });
    cb(null, resumeStoragePath);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});
const upload = multer({ storage });

const loadProjectForAccess = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    req.project = project;
    if (req.user?.role === "admin") {
      return next();
    }
    return checkTier(project.tier)(req, res, next);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const loadProjectForSoftReadinessAccess = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    req.project = project;

    if (req.user?.role === "admin") {
      return next();
    }

    const isAssigned = await Task.exists({ project: project._id, assignedTo: req.user._id });
    if (isAssigned) {
      return next();
    }

    return checkTier(project.tier)(req, res, next);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Admin only
router.post("/", protect, admin, createProject);
router.get("/my", protect, getMyProjects);
router.get("/:id", protect, loadProjectForSoftReadinessAccess, getProjectById);
router.get("/:id/readiness", protect, loadProjectForSoftReadinessAccess, getProjectReadiness);
router.post("/:id/resume-analysis", protect, loadProjectForSoftReadinessAccess, upload.single("resume"), analyzeProjectResume);
router.put("/:id", protect, admin, updateProject);
// All users
router.get("/", protect, getProjects);
router.delete("/:id", protect, deleteProject);
module.exports = router;