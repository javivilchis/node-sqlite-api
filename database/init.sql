-- User types (roles)
CREATE TABLE IF NOT EXISTS user_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type_name TEXT UNIQUE NOT NULL
);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    user_type_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_type_id) REFERENCES user_types(id)
);

-- General entries
CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_viewed_at TEXT,
    last_viewed_by INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (last_viewed_by) REFERENCES users(id)
);

-- Advisor-specific entries
CREATE TABLE IF NOT EXISTS advisor_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER NOT NULL,
    advisor_name TEXT NOT NULL,
    notes TEXT,
    FOREIGN KEY (entry_id) REFERENCES entries(id)
);

-- Achievement-specific entries
CREATE TABLE IF NOT EXISTS achievement_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id INTEGER NOT NULL,
    achievement_title TEXT NOT NULL,
    description TEXT,
    FOREIGN KEY (entry_id) REFERENCES entries(id)
);

-- Seed user types
INSERT OR IGNORE INTO user_types (type_name)
VALUES ('admin'), ('user'), ('super_admin');
