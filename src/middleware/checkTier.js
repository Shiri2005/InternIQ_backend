const tierRank = {
  free: 0,
  pro: 1,
  premium: 2,
};

module.exports = function checkTier(requiredTier = "free") {
  return (req, res, next) => {
    if (req.user?.role === "admin") {
      return next();
    }

    const userTier = tierRank[req.user?.tier] ?? -1;
    const neededTier = tierRank[requiredTier] ?? Number.MAX_SAFE_INTEGER;

    if (userTier < neededTier) {
      return res.status(403).json({
        message: "Access denied: upgrade your tier",
      });
    }

    next();
  };
};