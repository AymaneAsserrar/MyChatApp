// Required dependencies
const express = require("express");
const { createServer } = require("node:http");
const { join } = require("node:path");
const { Server } = require("socket.io");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const { availableParallelism } = require("node:os");
const cluster = require("node:cluster");
const { createAdapter, setupPrimary } = require("@socket.io/cluster-adapter");
const multer = require("multer");
const path = require("path");

// Configure file upload for avatars
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/uploads/"); // Make sure this directory exists
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/)) {
      return cb(new Error("Only image files are allowed!"));
    }
    cb(null, true);
  },
});

// Cluster setup for scalability
if (cluster.isPrimary) {
  const numCPUs = availableParallelism();
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork({
      PORT: 3000 + i,
    });
  }
  return setupPrimary();
}

async function main() {
  // Database initialization
  const db = await open({
    filename: "chat.db",
    driver: sqlite3.Database,
  });

  // Create database schema
  await db.exec(`
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

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            avatar TEXT,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'online'
        );

        CREATE TABLE IF NOT EXISTS channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            created_by TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_private BOOLEAN DEFAULT 0,
            description TEXT
        );

         CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            avatar TEXT,  -- Store avatar URL or base64 data
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'online'
          );

          CREATE TABLE IF NOT EXISTS messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              client_offset TEXT UNIQUE,
              content TEXT NOT NULL,
              username TEXT NOT NULL,
              avatar TEXT,  -- Store avatar URL for message history
              channel TEXT DEFAULT 'general',
              timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
              is_private BOOLEAN DEFAULT 0,
              recipient TEXT
          );

        CREATE TABLE IF NOT EXISTS channel_members (
            channel_id INTEGER,
            username TEXT,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (channel_id) REFERENCES channels(id),
            FOREIGN KEY (username) REFERENCES users(username),
            PRIMARY KEY (channel_id, username)
        );

        CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel);
        CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);

  // Create default channel if it doesn't exist
  try {
    await db.run(
      "INSERT INTO channels (name, created_by, description) VALUES (?, ?, ?)",
      ["general", "system", "General discussion channel"]
    );
  } catch (e) {
    console.log("General channel already exists");
  }

  // Initialize Express app and Socket.IO
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
      skipMiddlewares: true,
    },
    adapter: createAdapter(),
    pingTimeout: 60000,
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST"],
    },
  });

  // Middleware
  app.use(express.json());
  app.use(express.static("public"));

  app.use("/uploads", express.static("uploads"));

  // Store connected users in memory
  const connectedUsers = new Map();

  // API Routes
  app.get("/", (req, res) => {
    res.sendFile(join(__dirname, "index.html"));
  });

  app.post("/upload-avatar", upload.single("avatar"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const avatarUrl = `/uploads/${req.file.filename}`;
      res.json({ url: avatarUrl });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to upload avatar" });
    }
  });

  app.post("/upload", upload.single("avatar"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    res.json({ path: `/uploads/${req.file.filename}` });
  });
  // Socket.IO connection handling
  io.on("connection", async (socket) => {
    console.log("New connection:", socket.id);

    // Username setting
    socket.on("set username", async (username) => {
      if (!username?.trim()) {
        socket.emit("error", "Username is required");
        return;
      }

      try {
        const oldUser = connectedUsers.get(socket.id);

        // Get or create user with avatar
        const userRow = await db.get(
          "SELECT avatar FROM users WHERE username = ?",
          [username]
        );
        const avatar =
          userRow?.avatar ||
          "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop";

        // Update user in database
        await db.run(
          "INSERT OR REPLACE INTO users (username, avatar, last_seen, status) VALUES (?, ?, CURRENT_TIMESTAMP, ?)",
          [username, avatar, "online"]
        );

        // Update connected users map
        connectedUsers.set(socket.id, {
          username,
          avatar,
          channels: ["general"],
        });

        socket.join("general");

        if (oldUser) {
          io.emit("user disconnected", oldUser.username);
        }
        io.emit("user connected", username);

        // Send updated users list to all clients
        const onlineUsers = Array.from(connectedUsers.values());
        io.emit("update users", onlineUsers);
      } catch (e) {
        console.error("Error in set username:", e);
        socket.emit("error", "Failed to set username");
      }
    });

    // Avatar update handling
    socket.on("set avatar", async (avatar) => {
      const user = connectedUsers.get(socket.id);
      if (!user) return;

      try {
        // Update the avatar in the users table
        await db.run("UPDATE users SET avatar = ? WHERE username = ?", [
          avatar,
          user.username,
        ]);

        // Update the user's avatar in memory
        user.avatar = avatar;
        connectedUsers.set(socket.id, user);

        // Create an avatar update event that clients will use to update message avatars
        io.emit("avatar updated", {
          username: user.username,
          newAvatar: avatar,
        });

        // Also update the users list
        io.emit("update users", Array.from(connectedUsers.values()));
      } catch (e) {
        console.error("Error updating avatar:", e);
        socket.emit("error", "Failed to update avatar");
      }
    });

    socket.on("avatar updated", (data) => {
      // Update all existing messages from this user
      const messages = document.querySelectorAll("#messages li");
      messages.forEach((messageElement) => {
        const usernameElement = messageElement.querySelector(".font-semibold");
        if (usernameElement && usernameElement.textContent === data.username) {
          const avatarImg = messageElement.querySelector("img");
          if (avatarImg) {
            avatarImg.src = data.newAvatar;
          }
        }
      });
    });
    // Message handling
    socket.on("chat message", async (msg, clientOffset, callback) => {
      const user = connectedUsers.get(socket.id);
      if (!user) {
        callback?.();
        return;
      }

      try {
        // Get current user avatar
        const userRow = await db.get(
          "SELECT avatar FROM users WHERE username = ?",
          [user.username]
        );
        const currentAvatar = userRow?.avatar || user.avatar;

        const result = await db.run(
          `INSERT INTO messages (
                  content, client_offset, username, 
                  channel, is_private, recipient, avatar
              ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            msg.content,
            clientOffset,
            user.username,
            msg.channel,
            msg.isPrivate ? 1 : 0,
            msg.recipient,
            currentAvatar, // Use current avatar
          ]
        );

        const fullMessage = {
          ...msg,
          id: result.lastID,
          username: user.username,
          avatar: currentAvatar,
          timestamp: new Date().toISOString(),
        };

        if (msg.isPrivate && msg.recipient) {
          // Handle private message
          const targetSocket = Array.from(connectedUsers.entries()).find(
            ([_, u]) => u.username === msg.recipient
          )?.[0];

          if (targetSocket) {
            io.to(targetSocket).emit(
              "chat message",
              fullMessage,
              result.lastID
            );
            socket.emit("chat message", fullMessage, result.lastID);
          }
        } else {
          // Broadcast to channel
          io.to(msg.channel).emit("chat message", fullMessage, result.lastID);
        }

        callback?.();
      } catch (e) {
        console.error("Error saving message:", e);
        socket.emit("error", "Failed to send message");
      }
    });

    // Typing indicators
    socket.on("typing", (channel) => {
      const user = connectedUsers.get(socket.id);
      if (user) {
        socket.to(channel).emit("typing", {
          username: user.username,
          channel,
        });
      }
    });

    socket.on("stop typing", (channel) => {
      const user = connectedUsers.get(socket.id);
      if (user) {
        socket.to(channel).emit("stop typing", {
          username: user.username,
          channel,
        });
      }
    });

    // Channel operations
    socket.on("create channel", async (channelData) => {
      const user = connectedUsers.get(socket.id);
      if (!user) return;

      try {
        const { name, isPrivate, description } = channelData;

        await db.run(
          `INSERT INTO channels (name, created_by, is_private, description) 
                   VALUES (?, ?, ?, ?)`,
          [name, user.username, isPrivate ? 1 : 0, description]
        );

        const channels = await db.all(
          "SELECT name, description FROM channels WHERE is_private = 0"
        );
        io.emit("update channels", channels);
      } catch (e) {
        console.error("Error creating channel:", e);
        socket.emit("error", "Failed to create channel");
      }
    });

    socket.on("join channel", async (channel) => {
      const user = connectedUsers.get(socket.id);
      if (!user) return;

      try {
        socket.join(channel);

        // Modified query to always get the latest avatar
        const messages = await db.all(
          `SELECT 
                  m.id, m.content, m.username, m.channel, m.timestamp,
                  COALESCE(u.avatar, m.avatar) as avatar
               FROM messages m 
               LEFT JOIN users u ON m.username = u.username 
               WHERE m.channel = ? 
               ORDER BY m.timestamp DESC LIMIT 50`,
          [channel]
        );

        messages.reverse().forEach((msg) => {
          socket.emit(
            "chat message",
            {
              id: msg.id,
              content: msg.content,
              username: msg.username,
              channel: msg.channel,
              avatar:
                msg.avatar ||
                "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop",
              timestamp: msg.timestamp,
            },
            msg.id
          );
        });
      } catch (e) {
        console.error("Error joining channel:", e);
        socket.emit("error", "Failed to join channel");
      }
    });

    // Disconnection handling
    socket.on("disconnect", async () => {
      const user = connectedUsers.get(socket.id);
      if (user) {
        try {
          await db.run(
            "UPDATE users SET last_seen = CURRENT_TIMESTAMP, status = ? WHERE username = ?",
            ["offline", user.username]
          );

          connectedUsers.delete(socket.id);
          io.emit("user disconnected", user.username);

          // Send updated users list
          const onlineUsers = Array.from(connectedUsers.values());
          io.emit("update users", onlineUsers);
        } catch (e) {
          console.error("Error handling disconnect:", e);
        }
      }
    });

    function appendMessage(message) {
      const messageElement = document.createElement("li");
      messageElement.className = "flex space-x-3 message-appear";

      const timestamp = new Date(message.timestamp).toLocaleTimeString();

      messageElement.innerHTML = `
          <img src="${message.avatar}" class="user-avatar w-10 h-10 rounded-full">
          <div class="flex-1">
              <div class="flex items-baseline space-x-2">
                  <span class="font-semibold message-username">${message.username}</span>
                  <span class="text-xs text-gray-500">${timestamp}</span>
              </div>
              <p class="text-gray-800 mt-1">${message.content}</p>
          </div>
      `;

      messages.appendChild(messageElement);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Message recovery after disconnection
    if (!socket.recovered) {
      try {
        await db.each(
          `SELECT messages.*, users.avatar 
                   FROM messages 
                   LEFT JOIN users ON messages.username = users.username
                   WHERE messages.id > ? AND messages.is_private = 0`,
          [socket.handshake.auth.serverOffset || 0],
          (_err, row) => {
            socket.emit(
              "chat message",
              {
                content: row.content,
                username: row.username,
                channel: row.channel,
                avatar: row.avatar,
                timestamp: row.timestamp,
              },
              row.id
            );
          }
        );
      } catch (e) {
        console.error("Error recovering messages:", e);
        socket.emit("error", "Failed to recover messages");
      }
    }

    // Send initial channel list
    try {
      const channels = await db.all(
        "SELECT name, description FROM channels WHERE is_private = 0"
      );
      socket.emit("update channels", channels);
    } catch (e) {
      console.error("Error fetching channels:", e);
      socket.emit("error", "Failed to fetch channels");
    }
  });

  // Start server
  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

// Error handling for the main function
main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
