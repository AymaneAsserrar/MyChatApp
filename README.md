# ProjetNodeJS-SOUKI-ASSERRAR

A real-time chat application built with Node.js, Socket.IO, and SQLite, featuring a modern UI with Tailwind CSS.

## Features

- 💬 Real-time messaging with Socket.IO
- 👤 User authentication and presence detection
- 🎨 Customizable user avatars with upload support
- 📡 Automatic reconnection and message recovery
- 💭 Typing indicators
- 🔔 Online/Away status updates
- 📜 Message history persistence with SQLite
- 🔒 Private messaging support
- 📝 Multiple chat channels
- 🎯 Responsive design with Tailwind CSS
- 🚀 Cluster mode support for scalability

## Prerequisites

- Node.js (v14 or higher)
- NPM
- SQLite3

## Installation

1. Clone the repository:

```bash
git clone <your-repo-url>
cd modern-chat-app
```

2. Install dependencies:

```bash
npm install
```

3. Create uploads directory:

```bash
mkdir -p public/uploads
```

4. Start the server:

```bash
npm start
```

The application will be available at `http://localhost:3000`

## Dependencies

- Express.js - Web application framework
- Socket.IO - Real-time bidirectional event-based communication
- SQLite3 - Database engine
- Multer - File upload handling
- Tailwind CSS - Utility-first CSS framework

## Project Structure

```
├── public/
│   └── uploads/     # Avatar uploads directory
├── index.html       # Frontend application
├── index.js         # Server implementation
├── chat.db          # SQLite database
└── package.json     # Project configuration
```

## Some instructions

Press the avatar on the top left to choose between default avatars or upload your own.
When you logout and re-login with the same name you should keep your info like the chosen avatar.
To send private messages(hidden to every other user) press the targeted user's name on the left.
If you tab out, the green dot near the icon turns yellow to indicate the user is away(you just need to collapse the tab).

## Features in Detail

### User Management

- Username selection on entry
- Custom avatar upload and selection
- Online/Away status tracking
- User presence notifications

### Messaging

- Real-time message delivery
- Message persistence in SQLite database
- Typing indicators
- Private messaging support
- Message history recovery after disconnection

### Channels

- Public channels support
- Channel creation
- Channel switching
- Message history per channel

### UI/UX

- Modern, responsive design
- Avatar customization interface
- Real-time status updates
- Typing indicators
- Clean, intuitive layout

## Database Schema

### Messages Table

```sql
CREATE TABLE messages (
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
```

### Users Table

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    avatar TEXT,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'online'
);
```

### Channels Table

```sql
CREATE TABLE channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_private BOOLEAN DEFAULT 0,
    description TEXT
);
```

## Socket.IO Events

### Client to Server

- `set username` - Set user's username
- `chat message` - Send a new message
- `typing` - User starts typing
- `stop typing` - User stops typing
- `away` - User goes away
- `back` - User returns
- `create channel` - Create a new channel
- `join channel` - Join a channel
- `set avatar` - Update user avatar

### Server to Client

- `chat message` - New message received
- `typing` - User is typing
- `stop typing` - User stopped typing
- `user connected` - User joined
- `user disconnected` - User left
- `away` - User went away
- `back` - User returned
- `update users` - Users list updated
- `update channels` - Channels list updated
- `error` - Error notification

## Error Handling

- Automatic reconnection on disconnection
- Message recovery after connection loss
- Error notifications for failed operations
- File upload restrictions and validation
- Database error handling

## Security Features

- File upload validation
- SQLite query parameterization
- Input sanitization
- File size limits
- Allowed file types restriction

## Performance Considerations

- Connection state recovery
- Cluster mode support
- Efficient database indexing
- Message pagination
- Optimized avatar handling

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the ASSERRAR-SOUKI License.
