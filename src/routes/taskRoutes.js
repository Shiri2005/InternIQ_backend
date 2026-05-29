const express = require("express");
const { getTasksByProject,createTask,getAllTasks,getMyTasks,updateTask,deleteTask,getTasks} = require("../controllers/taskController");
const protect = require("../middleware/authMiddleware");
const admin = require("../middleware/adminMiddleware");

const router = express.Router();

// Create Task (Admin only)
router.delete("/clear-all", async (req, res) => {
  await Task.deleteMany({});
  res.json({ message: "All tasks deleted" });
});
router.get("/project/:projectId", protect, getTasksByProject);
router.post("/", protect, admin, createTask);
router.get("/", protect, admin, getAllTasks);
router.get("/my", protect, getMyTasks);
router.put("/:id", protect, updateTask);
router.get("/admin/all", protect, admin, getAllTasks);
router.delete("/:id", protect, admin, deleteTask);
router.get("/project/:projectId", protect, getTasks);
module.exports = router;
