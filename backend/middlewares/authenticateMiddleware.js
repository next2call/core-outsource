const jwt = require("jsonwebtoken");
const billingDb = require("../models/billingdb");

const JWT_SECRET = "0987654321";

const authenticate = (roles = []) => {
  return async (req, res, next) => {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Access denied or incorrect token format.",
      });
    }

    const token = header.split(" ")[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      req.user = decoded;
      next();
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          message: "Session expired. Please login again.",
        });
      }

      return res.status(403).json({
        message: "Invalid token.",
      });
    }
  };
};

module.exports = authenticate;