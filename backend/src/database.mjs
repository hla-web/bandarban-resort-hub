import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function openDatabase() {
  let database;
  if (process.env.DATABASE_URL) {
    const mysql = await import('mysql2/promise');
    const pool = mysql.createPool(process.env.DATABASE_URL);
    const adapter = (connection) => ({
      all: async (sql, args = []) => (await connection.execute(sql, args))[0],
      get: async (sql, args = []) => (await connection.execute(sql, args))[0][0],
      run: async (sql, args = []) => (await connection.execute(sql, args))[0],
    });
    database = { ...adapter(pool), dialect: 'mysql', close: () => pool.end(), transaction: async (fn) => {
      const connection = await pool.getConnection();
      try { await connection.beginTransaction(); const result = await fn(adapter(connection)); await connection.commit(); return result; }
      catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
    }};
  } else {
    const { DatabaseSync } = await import('node:sqlite');
    const filename = process.env.DB_FILE || fileURLToPath(new URL('../.data/resort-hub.sqlite', import.meta.url));
    if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
    const sqlite = new DatabaseSync(filename);
    sqlite.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    let tail = Promise.resolve();
    const adapter = {
      all: async (sql, args = []) => sqlite.prepare(sql).all(...args),
      get: async (sql, args = []) => sqlite.prepare(sql).get(...args),
      run: async (sql, args = []) => sqlite.prepare(sql).run(...args),
    };
    database = { ...adapter, dialect: 'sqlite', close: async () => sqlite.close(), transaction: (fn) => {
      const result = tail.then(async () => {
        sqlite.exec('BEGIN IMMEDIATE');
        try { const result = await fn(adapter); sqlite.exec('COMMIT'); return result; }
        catch (error) { sqlite.exec('ROLLBACK'); throw error; }
      });
      tail = result.catch(() => {}); return result;
    }};
  }
  for (const sql of [
    `CREATE TABLE IF NOT EXISTS users (id VARCHAR(191) PRIMARY KEY, name VARCHAR(191) NOT NULL, email VARCHAR(191) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, role VARCHAR(20) NOT NULL, session_version INTEGER NOT NULL DEFAULT 0, created_at VARCHAR(40) NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS resorts (id VARCHAR(191) PRIMARY KEY, owner_id VARCHAR(191), name VARCHAR(191) NOT NULL, area VARCHAR(191) NOT NULL, location VARCHAR(255) NOT NULL, price INTEGER NOT NULL, status VARCHAR(20) NOT NULL, metadata TEXT NOT NULL, FOREIGN KEY(owner_id) REFERENCES users(id))`,
    `CREATE TABLE IF NOT EXISTS rooms (id VARCHAR(191) PRIMARY KEY, resort_id VARCHAR(191) NOT NULL, name VARCHAR(191) NOT NULL, price INTEGER NOT NULL, capacity INTEGER NOT NULL, inventory INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, metadata TEXT NOT NULL, FOREIGN KEY(resort_id) REFERENCES resorts(id))`,
    `CREATE TABLE IF NOT EXISTS room_blocks (id VARCHAR(191) PRIMARY KEY, room_id VARCHAR(191) NOT NULL, start_date VARCHAR(10) NOT NULL, end_date VARCHAR(10) NOT NULL, blocked_count INTEGER NOT NULL, note VARCHAR(255) NOT NULL, FOREIGN KEY(room_id) REFERENCES rooms(id))`,
    `CREATE TABLE IF NOT EXISTS bookings (id VARCHAR(191) PRIMARY KEY, user_id VARCHAR(191) NOT NULL, resort_id VARCHAR(191) NOT NULL, room_id VARCHAR(191) NOT NULL, check_in VARCHAR(10) NOT NULL, check_out VARCHAR(10) NOT NULL, guests INTEGER NOT NULL, room_count INTEGER NOT NULL, guest_name VARCHAR(191) NOT NULL, phone VARCHAR(30) NOT NULL, total INTEGER NOT NULL, advance INTEGER NOT NULL, status VARCHAR(30) NOT NULL, refund INTEGER NOT NULL DEFAULT 0, created_at VARCHAR(40) NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(resort_id) REFERENCES resorts(id), FOREIGN KEY(room_id) REFERENCES rooms(id))`,
    `CREATE TABLE IF NOT EXISTS payments (id VARCHAR(191) PRIMARY KEY, booking_id VARCHAR(191) NOT NULL, amount INTEGER NOT NULL, kind VARCHAR(30) NOT NULL, status VARCHAR(30) NOT NULL, created_at VARCHAR(40) NOT NULL, FOREIGN KEY(booking_id) REFERENCES bookings(id))`,
  ]) await database.run(sql);
  const userColumns=database.dialect==='sqlite'?await database.all('PRAGMA table_info(users)'):await database.all("SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users'");
  if(!userColumns.some(column=>column.name==='session_version'))await database.run('ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0');
  return database;
}
