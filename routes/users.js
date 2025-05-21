const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Adjust path to your User model

// Middleware to verify JWT
const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// GET /users/me - Get current user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({
      discordName: user.discordName,
      email: user.email,
      balance: user.balance,
      gameHistory: user.gameHistory || [],
    });
  } catch (err) {
    console.error('Error in /users/me:', err);
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
    console.error('Error in /users/leaderboard:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;