const mysql = require("mysql2/promise");
const { env } = require("../config/env");

const cdkDatabaseUrl = new URL(env.cdkDatabaseUrl.replace(/^mysql:\/\//i, "mysql://"));

const pool = mysql.createPool({
  host: cdkDatabaseUrl.hostname,
  port: Number(cdkDatabaseUrl.port || 3306),
  user: decodeURIComponent(cdkDatabaseUrl.username),
  password: decodeURIComponent(cdkDatabaseUrl.password),
  database: cdkDatabaseUrl.pathname.replace(/^\//, ""),
  charset: cdkDatabaseUrl.searchParams.get("charset") || "utf8mb4",
  waitForConnections: true,
  connectionLimit: 5,
});

module.exports = {
  cdkPool: pool,
};
