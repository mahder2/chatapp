import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import './App.css';

// Define API_URL at the top
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const socket = io(API_URL);

function App() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    
    const [currentUser, setCurrentUser] = useState(null);
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loginData, setLoginData] = useState({ email: '', password: '' });
    const [registerData, setRegisterData] = useState({ username: '', email: '', password: '' });
    const [showRegister, setShowRegister] = useState(false);

    // Define fetchUsers with useCallback
    const fetchUsers = useCallback(async () => {
        if (!currentUser) return;
        try {
            const response = await axios.get(`${API_URL}/api/users/${currentUser.id}`);
            setUsers(response.data);
        } catch (error) {
            console.error('Error fetching users:', error);
        }
    }, [currentUser]); // API_URL is stable, doesn't need to be in deps

    // Define fetchMessages with useCallback
    const fetchMessages = useCallback(async () => {
        if (!currentUser || !selectedUser) return;
        try {
            const response = await axios.get(
                `${API_URL}/api/messages/${currentUser.id}/${selectedUser.id}`
            );
            setMessages(response.data);
        } catch (error) {
            console.error('Error fetching messages:', error);
        }
    }, [currentUser, selectedUser]); // API_URL is stable

    // Socket effects
    useEffect(() => {
        if (currentUser) {
            socket.emit('join', currentUser.id);
            
            socket.on('receive_message', (message) => {
                if (selectedUser && (message.sender_id === selectedUser.id)) {
                    setMessages(prev => [...prev, message]);
                }
            });

            return () => {
                socket.off('receive_message');
            };
        }
    }, [currentUser, selectedUser]);

    // Fetch users when currentUser changes
    useEffect(() => {
        if (currentUser) {
            fetchUsers();
        }
    }, [currentUser, fetchUsers]);

    // Fetch messages when selectedUser changes
    useEffect(() => {
        if (currentUser && selectedUser) {
            fetchMessages();
        }
    }, [currentUser, selectedUser, fetchMessages]);

    // Rest of your functions (handleLogin, handleRegister, sendMessage) remain the same
    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            const response = await axios.post(`${API_URL}/api/login`, loginData);
            if (response.data.success) {
                
                setCurrentUser(response.data.user);
                setIsLoggedIn(true);
            }
        } catch (error) {
            alert('Login failed: ' + (error.response?.data?.error || 'Unknown error'));
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        try {
            const response = await axios.post(`${API_URL}/api/register`, registerData);
            if (response.data.success) {
                alert('Registration successful! Please login.');
                setShowRegister(false);
                setRegisterData({ username: '', email: '', password: '' });
            }
        } catch (error) {
            alert('Registration failed: ' + (error.response?.data?.error || 'Unknown error'));
        }
    };

    const sendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedUser) return;

        const messageData = {
            sender_id: currentUser.id,
            receiver_id: selectedUser.id,
            message: newMessage
        };

        socket.emit('send_message', messageData);
        setMessages(prev => [...prev, { ...messageData, created_at: new Date() }]);
        setNewMessage('');
    };

    // Rest of your return statement (JSX) remains exactly the same
    if (!isLoggedIn) {
        return (
            <div className="auth-container">
                <div className="auth-box">
                    <h1>💬 ChatApp</h1>
                    {showRegister ? (
                        <form onSubmit={handleRegister}>
                            <h2>Register</h2>
                            <input
                                type="text"
                                placeholder="Username"
                                value={registerData.username}
                                onChange={(e) => setRegisterData({...registerData, username: e.target.value})}
                                required
                            />
                            <input
                                type="email"
                                placeholder="Email"
                                value={registerData.email}
                                onChange={(e) => setRegisterData({...registerData, email: e.target.value})}
                                required
                            />
                            <input
                                type="password"
                                placeholder="Password"
                                value={registerData.password}
                                onChange={(e) => setRegisterData({...registerData, password: e.target.value})}
                                required
                            />
                            <button type="submit">Register</button>
                            <p onClick={() => setShowRegister(false)}>Already have an account? Login</p>
                        </form>
                    ) : (
                        <form onSubmit={handleLogin}>
                            <h2>Login</h2>
                            <input
                                type="email"
                                placeholder="Email"
                                value={loginData.email}
                                onChange={(e) => setLoginData({...loginData, email: e.target.value})}
                                required
                            />
                            <input
                                type="password"
                                placeholder="Password"
                                value={loginData.password}
                                onChange={(e) => setLoginData({...loginData, password: e.target.value})}
                                required
                            />
                            <button type="submit">Login</button>
                            <p onClick={() => setShowRegister(true)}>New user? Register here</p>
                        </form>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="chat-container">
            <div className="sidebar">
                <div className="user-profile">
                    <h3>👤 {currentUser.username}</h3>
                </div>
                <div className="users-list">
                    <h3>Online Users</h3>
                    {users.map(user => (
                        <div
                            key={user.id}
                            className={`user-item ${selectedUser?.id === user.id ? 'selected' : ''}`}
                            onClick={() => setSelectedUser(user)}
                        >
                            <span className="user-name">{user.username}</span>
                            <span className="online-dot">●</span>
                        </div>
                    ))}
                </div>
            </div>
            
            <div className="chat-area">
                {selectedUser ? (
                    <>
                        <div className="chat-header">
                            <h3>Chat with {selectedUser.username}</h3>
                        </div>
                        <div className="messages-area">
                            {messages.map((msg, index) => (
                                <div
                                    key={index}
                                    className={`message ${msg.sender_id === currentUser.id ? 'sent' : 'received'}`}
                                >
                                    <div className="message-content">{msg.message}</div>
                                    <div className="message-time">
                                        {new Date(msg.created_at).toLocaleTimeString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <form className="message-input" onSubmit={sendMessage}>
                            <input
                                type="text"
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                placeholder="Type a message..."
                            />
                            <button type="submit">Send</button>
                        </form>
                    </>
                ) : (
                    <div className="no-chat">
                        <h2>Select a user to start chatting</h2>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;