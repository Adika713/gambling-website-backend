const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Adjust path to your User model

// Middleware to verify JWT
const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    console.log('authMiddleware: No token provided');
    return res.status(401).json({ message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('authMiddleware: Token decoded:', { id: decoded.id, discordId: decoded.discordId, email: decoded.email });
    req.user = decoded;
    next();
  } catch (err) {
    console.error('authMiddleware: Token verification failed:', err.message);
    res.status(401).json({ message: 'Invalid token' });
  }
};

// GET /users/me - Get current user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    console.log('GET /users/me: Fetching user with ID:', req.user.id, 'or discordId:', req.user.discordId);
    let user;
    if (req.user.discordId) {
      user = await User.findOne({ discordId: req.user.discordId }).select('-password');
    } else {
      user = await User.findById(req.user.id).select('-password');
    }
    if (!user) {
      console.log('GET /users/me: User not found for ID:', req.user.id, 'or discordId:', req.user.discordId);
      return res.status(404).json({ message: 'User not found' });
    }
    console.log('GET /users/me: User found:', { email: user.email, balance: user.balance });
    res.json({
      discordName: user.discordName,
      email: user.email,
      balance: user.balance,
      gameHistory: user.gameHistory || [],
    });
  } catch (err) {
    console.error('GET /users/me: Error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /users/leaderboard - Get leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const users = await User.find()
      .sort({ balance: -1 })
      .limit(50)
      .select('discordName balance');
    res.json(users);
  } catch (err) {
    console.error('GET /users/leaderboard: Error:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;