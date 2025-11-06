import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { readFile } from "fs/promises";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key";

// Initialize schema
const db = new sqlite3.Database("./database/data.db");

const initSQL = await readFile("./database/init.sql", "utf8");
await new Promise((resolve, reject) =>
  db.exec(initSQL, (err) => (err ? reject(err) : resolve()))
);
console.log("✅ SQLite schema initialized");
// ---------- Middleware ----------
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
    } catch (err) {
      res.status(401).json({ error: "Invalid or expired token" });
    }
  };
}
// --- CRUD for Users ---
// ---------- LOGIN ----------
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Missing credentials" });
  }

  try {
    // Wrap sqlite3 callback in a Promise
    const user = await new Promise((resolve, reject) => {
      db.get(
        `
        SELECT u.*, ut.type_name AS role
        FROM users u
        JOIN user_types ut ON u.user_type_id = ut.id
        WHERE u.username = ?
        `,
        [username],
        (err, row) => {
          if (err) return reject(err);
          resolve(row);
        }
      );
    });

    // No user found
    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // Validate password with bcrypt
    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // Issue JWT token
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: "2h" }
    );

    return res.json({ token, role: user.role });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Server error during login" });
  }
});

// ---------- Protected Route Example ----------
app.get(
  "/api/entries",
  authMiddleware(["admin", "super_admin"]),
  async (req, res) => {
    try {
      const entries = await new Promise((resolve, reject) => {
        db.all(
          `
          SELECT e.*, u.username AS author_name
          FROM entries e
          JOIN users u ON e.user_id = u.id
          ORDER BY e.id DESC
          `,
          (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
          }
        );
      });

      res.json(entries);
    } catch (err) {
      console.error("Error querying entries:", err);
      res.status(500).json({ error: "Failed to retrieve entries" });
    }
  }
);
app.post(
  "/api/entries",
  authMiddleware(["admin", "super_admin", "user"]), // who’s allowed to create
  async (req, res) => {
    const { text } = req.body;
    const userId = req.user.id; // came from the JWT payload

    if (!text) {
      return res.status(400).json({ error: "Missing required field: text" });
    }

    try {
      const result = await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO entries (user_id, text, created_at)
           VALUES (?, ?, datetime('now'))`,
          [userId, text],
          function (err) {
            if (err) return reject(err);
            resolve({ id: this.lastID });
          }
        );
      });

      // Fetch the newly created record to return
      const newEntry = await new Promise((resolve, reject) => {
        db.get(
          `SELECT e.*, u.username AS author_name
           FROM entries e
           JOIN users u ON e.user_id = u.id
           WHERE e.id = ?`,
          [result.id],
          (err, row) => (err ? reject(err) : resolve(row))
        );
      });

      res.status(201).json(newEntry);
    } catch (err) {
      console.error("Failed to create entry:", err);
      res.status(500).json({ error: "Database insert failed" });
    }
  }
);
// update
app.put(
  "/api/entries/:id",
  authMiddleware(["admin", "super_admin"]),
  async (req, res) => {
    const { id } = req.params;
    const { text } = req.body;
    db.run(
      "UPDATE entries SET text = ? WHERE id = ?",
      [text, id],
      function (err) {
        if (err)
          return res.status(500).json({ error: "Database update failed" });
        res.json({ id, text });
      }
    );
  }
);
// delete
app.delete(
  "/api/entries/:id",
  authMiddleware(["admin", "super_admin"]),
  async (req, res) => {
    const { id } = req.params;
    db.run("DELETE FROM entries WHERE id = ?", [id], function (err) {
      if (err) return res.status(500).json({ error: "Delete failed" });
      res.status(204).end();
    });
  }
);
// --- CREATE USER ---
app.post("/api/users", async (req, res) => {
  const { username, password, user_type_id } = req.body;

  // 💡 Validate input
  if (!username || !password || !user_type_id)
    return res
      .status(400)
      .json({ error: "Missing fields: username, password, or user_type_id" });

  try {
    // Check for existing username
    const existing = await db.get("SELECT id FROM users WHERE username = ?", [
      username,
    ]);
    if (existing)
      return res.status(409).json({ error: "Username already exists" });

    // Verify valid user_type_id
    const typeExists = await db.get("SELECT id FROM user_types WHERE id = ?", [
      user_type_id,
    ]);
    if (!typeExists)
      return res.status(400).json({ error: "Invalid user_type_id" });

    // Hash password
    const hashed = await bcrypt.hash(password, 10);

    // Insert user
    const result = await db.run(
      "INSERT INTO users (username, password, user_type_id) VALUES (?, ?, ?)",
      [username, hashed, user_type_id]
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
    console.error("❌ Error creating user:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/users", async (req, res) => {
  const users = await db.all(`
    SELECT users.id, username, type_name AS role, created_at
    FROM users
    JOIN user_types ON users.user_type_id = user_types.id
  `);
  res.json(users);
});

// --- CRUD for Entries ---

// app.post("/api/entries", async (req, res) => {
//   const { user_id, text } = req.body;
//   if (!user_id || !text)
//     return res.status(400).json({ error: "Missing fields" });

//   const result = await db.run(
//     "INSERT INTO entries (user_id, text) VALUES (?, ?)",
//     [user_id, text]
//   );
//   const entry = await db.get("SELECT * FROM entries WHERE id = ?", [
//     result.lastID,
//   ]);
//   res.status(201).json(entry);
// });

app.get("/api/entries", async (_, res) => {
  const entries = await db.all(`
    SELECT e.*, u.username AS author_name
    FROM entries e
    JOIN users u ON e.user_id = u.id
    ORDER BY e.id DESC
  `);
  res.json(entries);
});

// Track view
app.get("/api/entries/:id/view", async (req, res) => {
  const { id } = req.params;
  const { viewer_id } = req.query;

  await db.run(
    "UPDATE entries SET last_viewed_at = CURRENT_TIMESTAMP, last_viewed_by = ? WHERE id = ?",
    [viewer_id || null, id]
  );

  const updated = await db.get(
    `
    SELECT e.*, u.username AS last_viewed_by_user
    FROM entries e
    LEFT JOIN users u ON e.last_viewed_by = u.id
    WHERE e.id = ?
  `,
    [id]
  );
  res.json(updated);
});

// --- Advisor Entries ---
app.post("/api/advisor_entries", async (req, res) => {
  const { entry_id, advisor_name, notes } = req.body;
  if (!entry_id || !advisor_name)
    return res.status(400).json({ error: "Missing fields" });

  const result = await db.run(
    "INSERT INTO advisor_entries (entry_id, advisor_name, notes) VALUES (?, ?, ?)",
    [entry_id, advisor_name, notes]
  );
  const record = await db.get("SELECT * FROM advisor_entries WHERE id = ?", [
    result.lastID,
  ]);
  res.status(201).json(record);
});

app.get("/api/advisor_entries", async (_, res) => {
  const records = await db.all(`
    SELECT ae.*, e.text AS entry_text
    FROM advisor_entries ae
    JOIN entries e ON ae.entry_id = e.id
  `);
  res.json(records);
});

// --- Achievement Entries ---
app.post("/api/achievement_entries", async (req, res) => {
  const { entry_id, achievement_title, description } = req.body;
  if (!entry_id || !achievement_title)
    return res.status(400).json({ error: "Missing fields" });

  const result = await db.run(
    "INSERT INTO achievement_entries (entry_id, achievement_title, description) VALUES (?, ?, ?)",
    [entry_id, achievement_title, description]
  );
  const record = await db.get(
    "SELECT * FROM achievement_entries WHERE id = ?",
    [result.lastID]
  );
  res.status(201).json(record);
});

app.get("/api/achievement_entries", async (_, res) => {
  const records = await db.all(`
    SELECT ae.*, e.text AS entry_text
    FROM achievement_entries ae
    JOIN entries e ON ae.entry_id = e.id
  `);
  res.json(records);
});

app.listen(PORT, () =>
  console.log(`🚀 API running at http://localhost:${PORT}`)
);
