const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

const corsOptions = {
    origin: ['http://localhost:3000', 'https://your-frontend-url.onrender.com'],
    methods: ["GET", "POST"],
    credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());

// MySQL connection
const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'chatapp',
    port: 3307,
    waitForConnections: true
}).promise();

// Test connection
db.getConnection()
    .then(() => console.log('✅ MySQL connected'))
    .catch(err => console.log('❌ MySQL error:', err));

// Register endpoint
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.query(
            'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
            [username, email, hashedPassword]
        );
        res.json({ success: true, userId: result.insertId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        const user = users[0];
        const valid = await bcrypt.compare(password, user.password);
        
        if (!valid) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        const token = jwt.sign({ userId: user.id }, 'secret123');
        res.json({ 
            success: true, 
            token, 
            user: { id: user.id, username: user.username, email: user.email }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all users except me
app.get('/api/users/:userId', async (req, res) => {
    try {
        const [users] = await db.query(
            'SELECT id, username FROM users WHERE id != ?',
            [req.params.userId]
        );
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get messages between two users
app.get('/api/messages/:user1/:user2', async (req, res) => {
    try {
        const [messages] = await db.query(
            `SELECT * FROM messages 
             WHERE (sender_id = ? AND receiver_id = ?) 
                OR (sender_id = ? AND receiver_id = ?)
             ORDER BY created_at ASC`,
            [req.params.user1, req.params.user2, req.params.user2, req.params.user1]
        );
        res.json(messages);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Socket.io for real-time messages
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('join', (userId) => {
        socket.join(`user_${userId}`);
        console.log(`User ${userId} joined their room`);
    });
    
    socket.on('send_message', async (data) => {
        const { sender_id, receiver_id, message } = data;
        
        // Save to database
        const [result] = await db.query(
            'INSERT INTO messages (sender_id, receiver_id, message) VALUES (?, ?, ?)',
            [sender_id, receiver_id, message]
        );
        
        // Send to receiver
        io.to(`user_${receiver_id}`).emit('receive_message', {
            id: result.insertId,
            sender_id,
            message,
            created_at: new Date()
        });
        
        // Confirm to sender
        socket.emit('message_sent', { id: result.insertId });
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

server.listen(5000, () => {
    console.log('✅ Server running on http://localhost:5000');
});