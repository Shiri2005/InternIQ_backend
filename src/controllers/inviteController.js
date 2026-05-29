const Invite = require("../models/Invite");
const crypto = require("crypto");

exports.createInvite = async (req, res) => {
  try {
    const code = crypto.randomBytes(4).toString("hex"); // random code

    const invite = await Invite.create({ code });

    res.json(invite);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};