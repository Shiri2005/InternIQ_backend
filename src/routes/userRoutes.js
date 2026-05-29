const express = require("express");
const {
	createUser,
	getAllUsers,
	loginUser,
	getUserProfile,
	updateUserProfile,
	updateUserTier,
	updateUserSkills,
	getAdminOverview,
} = require("../controllers/userController");
const protect = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");
const { getMe } = require("../controllers/userController");
const router = express.Router();

router.post("/register", createUser);
router.post("/login", loginUser);
router.get("/me", protect, getMe);
router.get("/profile", protect,getUserProfile );
router.get("/admin-overview", protect, admin, getAdminOverview);
router.get("/", protect, admin, getAllUsers);
router.put("/profile", protect, updateUserProfile);
router.put("/profile/skills", protect, updateUserSkills);
router.put("/:id/tier", protect, admin, updateUserTier);
router.get("/admin-only", protect, admin, (req, res) => {
res.json({ message: "Welcome Admin!" });
});

module.exports = router;
