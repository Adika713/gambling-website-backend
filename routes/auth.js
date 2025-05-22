const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const User = require('../models/User');

router.post('/register', async (req, res) => {
  const { email, password, username, discordId } = req.body;
  try {
    if (!email || !password || !username) {
      console.log('Register: Missing required fields:', { email, username, hasPassword: !!password });
      return res.status(400).json({ message: 'Email, password, and username are required' });
    }
    let user = await User.findOne({ email });
    if (user) {
      console.log('Register: User already exists:', email);
      return res.status(400).json({ message: 'Email already in use' });
    }
    if (discordId) {
      user = await User.findOne({ discordId });
      if (user) {
        console.log('Register: Discord ID already in use:', discordId);
        return res.status(400).json({ message: 'Discord ID already in use' });
      }
    }
    user = new User({
      discordId,
      discordName: username,
      email,
      password: await bcrypt.hash(password, 10),
      balance: 0,
      gameHistory: [],
    });
    await user.save();
    console.log('Register: User created:', { _id: user._id, email, discordId });
    const token = jwt.sign({ id: user._id, discordId, email }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (err) {
    console.error('Register error:', err.message, err.stack);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: 'Invalid user data', errors: err.errors });
    }
    if (err.code === 11000) {
      const field = err.keyValue?.email ? 'email' : 'Discord ID';
      const value = err.keyValue?.email || err.keyValue?.discordId;
      console.log(`Register: Duplicate ${field}:`, value);
      return res.status(400).json({ message: `Duplicate ${field}: ${value}` });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) {
      console.log('Login: Missing required fields:', { email, hasPassword: !!password });
      return res.status(400).json({ message: 'Email and password are required' });
    }
    const user = await User.findOne({ email });
    if (!user) {
      console.log('Login: User not found:', email);
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('Login: Password mismatch:', email);
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    console.log('Login: User authenticated:', { _id: user._id, email, discordId: user.discordId });
    const token = jwt.sign({ id: user._id, discordId: user.discordId, email }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (err) {
    console.error('Login error:', err.message, err.stack);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/discord', (req, res) => {
  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent('https://gambling-website-backend.onrender.com/auth/discord/callback')}&response_type=code&scope=identify%20email`;
  console.log('Redirecting to Discord OAuth:', discordAuthUrl);
  res.redirect(discordAuthUrl);
});

router.get('/discord/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    console.log('Discord callback: No code provided');
    return res.status(400).json({ message: 'No code provided' });
  }
  try {
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: 'https://gambling-website-backend.onrender.com/auth/discord/callback',
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const { access_token } = tokenResponse.data;
    console.log('Discord callback: Access token received');

    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const { id: discordId, username, email, avatar } = userResponse.data;
    const discordAvatar = avatar ? `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png` : null;
    console.log('Discord callback: User data:', { discordId, username, email, discordAvatar });

    let user = await User.findOne({ discordId });
    if (!user) {
      user = new User({
        discordId,
        discordName: username,
        discordAvatar,
        email: email || `${discordId}@discord.placeholder`,
        password: await bcrypt.hash(discordId, 10),
        balance: 0,
        gameHistory: [],
      });
      await user.save();
      console.log('Discord callback: User created:', { _id: user._id, discordId, email });
    } else {
      user.discordName = username;
      user.discordAvatar = discordAvatar;
      await user.save();
      console.log('Discord callback: User updated:', { _id: user._id, discordId, email });
    }

    const token = jwt.sign({ id: user._id, discordId, email: user.email }, process.env.JWT_SECRET, { expiresIn: '1h' });
    console.log('Discord callback: JWT generated for:', discordId);
    res.redirect(`https://gambling-website-frontend.vercel.app/profile?token=${token}`);
  } catch (err) {
    console.error('Discord callback error:', err.response?.data || err.message, err.stack);
    res.status(500).json({ message: 'Discord authentication failed' });
  }
});

module.exports = router;