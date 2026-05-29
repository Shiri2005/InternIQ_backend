const express = require("express");
const multer = require("multer");
const auth = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");
const {
	getDashboardInsights,
	analyzeResume,
	getAdminAnalytics,
} = require("../controllers/aiController");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get("/insights", auth, getDashboardInsights);
router.post("/resume/analyze", auth, upload.single("resume"), analyzeResume);
router.get("/admin-analytics", auth, admin, getAdminAnalytics);

module.exports = router;
