require("dotenv").config();
const express = require("express");
const cors = require("cors");
const api = require("./routes/api");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.get("/", (_req, res) => res.json({ message: "Mobile API Running" }));
app.use("/api", api);
app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ status: "error", message: "Invalid JSON body. JSON keys and text values must use double quotes." });
  }
  console.error(err);
  res.status(err.status || 500).json({ status: "error", message: err.message || "Internal server error" });
});

const port = Number(process.env.PORT || 5000);
app.listen(port, () => console.log(`Mobile API listening on ${port}`));
