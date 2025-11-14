import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { readFile } from "fs/promises";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";

dotenv.config();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key";
const app = express();
app.use(express.json());
app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

let db;

// ✅ Open DB first, then register routes and start server
(async () => {
  const initPath = path.resolve("./database/init.sql");

  db = await open({
    filename: "./database/data.db",
    driver: sqlite3.Database,
  });
  console.log("✅ SQLite database connected");

  const initSQL = await readFile(initPath, "utf8");
  await db.exec(initSQL);
  console.log("✅ Schema initialized");
  // ---------- AUTH MIDDLEWARE ----------
  function authMiddleware(requiredRoles = []) {
    return (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(401).json({ error: "Missing token" });

      const token = authHeader.split(" ")[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;

        if (
          requiredRoles.length &&
          !requiredRoles.includes(decoded.role.toLowerCase())
        ) {
          return res.status(403).json({ error: "Insufficient permissions" });
        }

        next();
      } catch {
        res.status(401).json({ error: "Invalid or expired token" });
      }
    };
  }

  // ---------- LOGIN ----------
  app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: "Missing credentials" });

    try {
      const user = await db.get(
        `SELECT u.*, ut.type_name AS role
         FROM users u
         JOIN user_types ut ON u.user_type_id = ut.id
         WHERE u.username = ?`,
        [username.trim()]
      );

      if (!user)
        return res.status(401).json({ error: "Invalid username or password" });

      const valid = bcrypt.compareSync(password, user.password);
      if (!valid)
        return res.status(401).json({ error: "Invalid username or password" });

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: "2h" }
      );

      res.json({ token, role: user.role });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Server error during login" });
    }
  });

  // ---------- USERS ----------
  app.post("/api/users", async (req, res) => {
    const { username, password, user_type_id } = req.body;
    if (!username || !password || !user_type_id)
      return res.status(400).json({ error: "Missing fields" });

    try {
      const existing = await db.get("SELECT id FROM users WHERE username = ?", [
        username.trim(),
      ]);
      if (existing)
        return res.status(409).json({ error: "Username already exists" });

      const typeExists = await db.get(
        "SELECT id FROM user_types WHERE id = ?",
        [user_type_id]
      );
      if (!typeExists)
        return res.status(400).json({ error: "Invalid user_type_id" });

      const hashed = await bcrypt.hash(password, 10);

      const result = await db.run(
        "INSERT INTO users (username, password, user_type_id) VALUES (?, ?, ?)",
        [username.trim(), hashed, user_type_id]
      );

      const user = await db.get(
        `SELECT users.id, username, type_name AS role, created_at
           FROM users
           JOIN user_types ON users.user_type_id = user_types.id
          WHERE users.id = ?`,
        [result.lastID]
      );
      res.status(201).json({ message: "User created successfully", user });
    } catch (err) {
      console.error("❌ Error creating user:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/users", async (_req, res) => {
    const users = await db.all(`
      SELECT users.id, username, type_name AS role, created_at
      FROM users
      JOIN user_types ON users.user_type_id = user_types.id
    `);
    res.json(users);
  });

  // ---------- ENTRIES ----------
  app.get(
    "/api/entries",
    authMiddleware(["admin", "super_admin", "user"]),
    async (_req, res) => {
      try {
        const entries = await db.all(`
          SELECT e.*, u.username AS author_name
          FROM entries e
          JOIN users u ON e.user_id = u.id
          ORDER BY e.id DESC
        `);
        res.json(entries);
      } catch (err) {
        res.status(500).json({ error: "Failed to fetch entries" });
      }
    }
  );

  app.post(
    "/api/entries",
    authMiddleware(["admin", "super_admin", "user"]),
    async (req, res) => {
      const { text, description, temperature } = req.body;
      const userId = req.user.id;

      if (!text || !description || !temperature)
        return res
          .status(400)
          .json({ error: "Missing fields: text, description, temperature" });

      try {
        const result = await db.run(
          "INSERT INTO entries (user_id, text, description, temperature, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
          [userId, text, description, temperature]
        );
        const entry = await db.get(
          `SELECT e.*, u.username AS author_name
             FROM entries e
             JOIN users u ON e.user_id = u.id
            WHERE e.id = ?`,
          [result.lastID]
        );
        res.status(201).json(entry);
      } catch (err) {
        res.status(500).json({ error: "Database insert failed" });
      }
    }
  );
  app.get(
    "/api/entries/:id",
    authMiddleware(["admin", "super_admin", "user"]),
    async (req, res) => {
      const { id } = req.params;
      try {
        const entry = await db.get(
          `SELECT e.*, u.username AS author_name
             FROM entries e
             JOIN users u ON e.user_id = u.id
            WHERE e.id = ?`,
          [id]
        );
        if (!entry) return res.status(404).json({ error: "Entry not found" });

        // Update last_viewed_at and last_viewed_by
        await db.run(
          "UPDATE entries SET last_viewed_at = datetime('now'), last_viewed_by = ? WHERE id = ?",
          [req.user.id, id]
        );

        res.json(entry);
      } catch {
        res.status(500).json({ error: "Fetch failed" });
      }
    }
  );
  app.put(
    "/api/entries/:id",
    authMiddleware(["admin", "super_admin", "user"]),
    async (req, res) => {
      const { id } = req.params;
      const { text, description, temperature } = req.body;
      const editorId = req.user.id;

      try {
        // 1️⃣ Get current entry before update
        const current = await db.get("SELECT * FROM entries WHERE id = ?", [
          id,
        ]);
        if (!current) return res.status(404).json({ error: "Entry not found" });

        // 2️⃣ Save current snapshot to entry_history
        await db.run(
          `INSERT INTO entry_history
          (entry_id, text, description, temperature, edited_by)
         VALUES (?, ?, ?, ?, ?)`,
          [
            current.id,
            current.text,
            current.description,
            current.temperature,
            editorId,
          ]
        );

        // 3️⃣ Update main entry
        await db.run(
          `UPDATE entries
           SET text = ?,
               description = ?,
               temperature = ?,
               last_edited_by = ?,
               last_edited_at = datetime('now')
         WHERE id = ?`,
          [text, description, temperature, editorId, id]
        );

        // 4️⃣ Return updated entry
        const updated = await db.get(
          `SELECT e.*, u.username AS author_name,
                e2.username AS last_editor_name
           FROM entries e
           JOIN users u ON e.user_id = u.id
           LEFT JOIN users e2 ON e.last_edited_by = e2.id
          WHERE e.id = ?`,
          [id]
        );

        res.json(updated);
      } catch (err) {
        console.error("Update with history error:", err);
        res.status(500).json({ error: "Database update failed" });
      }
    }
  );
  // --- get history for an entry ---
  app.get(
    "/api/entries/:id/history",
    authMiddleware(["admin", "super_admin"]),
    async (req, res) => {
      const { id } = req.params;
      try {
        const history = await db.all(
          `SELECT h.*, u.username AS edited_by_name
           FROM entry_history h
           LEFT JOIN users u ON h.edited_by = u.id
          WHERE h.entry_id = ?
          ORDER BY h.edited_at DESC`,
          [id]
        );
        res.json(history);
      } catch (err) {
        console.error("History query error:", err);
        res.status(500).json({ error: "Failed to load history" });
      }
    }
  );

  app.delete(
    "/api/entries/:id",
    authMiddleware(["admin", "super_admin"]),
    async (req, res) => {
      const { id } = req.params;
      try {
        await db.run("DELETE FROM entries WHERE id = ?", [id]);
        res.status(204).end();
      } catch {
        res.status(500).json({ error: "Delete failed" });
      }
    }
  );

  // ✅ Start server *after DB opens and routes defined*
  app.listen(PORT, () =>
    console.log(`🚀 API ready at http://localhost:${PORT}`)
  );
})();
