const sql = require("mssql");
const {config} = require("../config")

const dbSettings = {
  user: config.dbUser,
  password: config.dbPassword,
  server: config.dbServer,
  database: config.dbDatabase,
  port:1433,
  options: {
    encrypt: true, // for azure
    trustServerCertificate: true, // change to true for local dev / self-signed certs
  },
};

exports.getConnection = async () => {
  try {
    const pool = await sql.connect("Server=tcp:version1sofware.database.windows.net,1433;Initial Catalog=conquestpoolsDB;Persist Security Info=False;User ID=version1sofware;Password=V3r$10n1$0ftw@r3;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;");
    return pool;
  } catch (error) {
    console.error(error);
  }
};

exports.sql = sql;
