const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Socket.IO CORS
const io = new Server(server, {
    cors: {
        origin: ['http://localhost:3000', 'https://chatapp-frontend-dhup.onrender.com'],
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Express CORS
const corsOptions = {
    origin: ['http://localhost:3000', 'https://chatapp-frontend-dhup.onrender.com'],
    methods: ["GET", "POST"],
    credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());

// ✅ SINGLE PostgreSQL connection - REMOVED the duplicate
const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Test connection
db.connect()
    .then(() => console.log('✅ PostgreSQL connected'))
    .catch(err => console.error('❌ PostgreSQL connection error:', err));

// Register endpoint - FIXED for PostgreSQL syntax
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        // ✅ Changed from MySQL (?) to PostgreSQL ($1, $2, $3) syntax
        const result = await db.query(
            'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id',
            [username, email, hashedPassword]
        );
        res.json({ success: true, userId: result.rows[0].id });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Login endpoint - FIXED for PostgreSQL syntax
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        // ✅ Changed from MySQL (?) to PostgreSQL ($1) syntax
        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        const user = result.rows[0];
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
        console.error('Login error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get all users except me - FIXED for PostgreSQL
app.get('/api/users/:userId', async (req, res) => {
    try {
        // ✅ Changed from MySQL (?) to PostgreSQL ($1) syntax
        const result = await db.query(
            'SELECT id, username FROM users WHERE id != $1',
            [req.params.userId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Users error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get messages between two users - FIXED for PostgreSQL
app.get('/api/messages/:user1/:user2', async (req, res) => {
    try {
        // ✅ Changed from MySQL (?) to PostgreSQL ($1, $2, $3, $4) syntax
        const result = await db.query(
            `SELECT * FROM messages 
             WHERE (sender_id = $1 AND receiver_id = $2) 
                OR (sender_id = $3 AND receiver_id = $4)
             ORDER BY created_at ASC`,
            [req.params.user1, req.params.user2, req.params.user2, req.params.user1]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Messages error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Socket.io for real-time messages - FIXED for PostgreSQL
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('join', (userId) => {
        socket.join(`user_${userId}`);
        console.log(`User ${userId} joined their room`);
    });
    
    socket.on('send_message', async (data) => {
        const { sender_id, receiver_id, message } = data;
        
        try {
            // ✅ Changed to PostgreSQL syntax with RETURNING
            const result = await db.query(
                'INSERT INTO messages (sender_id, receiver_id, message) VALUES ($1, $2, $3) RETURNING id, created_at',
                [sender_id, receiver_id, message]
            );
            
            // Send to receiver
            io.to(`user_${receiver_id}`).emit('receive_message', {
                id: result.rows[0].id,
                sender_id,
                message,
                created_at: new Date()
            });
            
            // Confirm to sender
            socket.emit('message_sent', { id: result.rows[0].id });
        } catch (error) {
            console.error('Send message error:', error);
        }
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

server.listen(5000, () => {
    console.log('✅ Server running on http://localhost:5000');
});