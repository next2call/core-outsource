const mysql = require("mysql2/promise");

const options = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  timezone: "+05:30"
};

// Mobile APIs use the same telephony_db tables as the existing CRM Node backend.
const appDb = mysql.createPool({ ...options, database: process.env.DB_NAME || "telephony_db" });

module.exports = { appDb };
