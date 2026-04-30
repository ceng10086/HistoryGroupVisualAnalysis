"use strict";

const path = require("path");
const Database = require("better-sqlite3");

const DB_PATH = path.resolve(
  __dirname,
  "../../cbdb_sqlite/cbdb_20260328.sqlite3"
);

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
db.pragma("cache_size = -64000");
db.pragma("temp_store = MEMORY");

module.exports = db;
