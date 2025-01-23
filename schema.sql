-- Chat Application Database Schema

-- Messages table for storing all chat messages
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_offset TEXT UNIQUE,
  content TEXT NOT NULL,
  username TEXT NOT NULL,
  channel TEXT DEFAULT 'general',
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_private BOOLEAN DEFAULT 0,
  recipient TEXT,
  avatar TEXT
);

-- Users table for storing user information
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  avatar TEXT,
  last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'online'
);

-- Channels table for storing chat channels/rooms
CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_private BOOLEAN DEFAULT 0,
  description TEXT
);

-- Channel members table for tracking channel membership
CREATE TABLE IF NOT EXISTS channel_members (
  channel_id INTEGER,
  username TEXT,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id),
  FOREIGN KEY (username) REFERENCES users(username),
  PRIMARY KEY (channel_id, username)
);

-- Create necessary indexes for better performance
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Insert default channel
INSERT OR IGNORE INTO channels (name, created_by, description) 
VALUES ('general', 'system', 'General discussion channel');