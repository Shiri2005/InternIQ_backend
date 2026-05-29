const express = require("express");
const router = express.Router();
const { createInvite } = require("../controllers/inviteController");

router.post("/create", createInvite);

module.exports = router;