const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const axios = require('axios');
const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password, username } = req.body;
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ message: 'Email or username already exists' });
    }
    const user = new User({ email, password, username });
    await user.save();
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.status(201).json({ token });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/discord', (req, res) => {
  try {
    const { state } = req.query;
    if (!state) return res.status(400).json({ message: 'Missing state parameter' });
    const redirectUri = encodeURIComponent(`${process.env.API_URL}/auth/discord/callback`);
    const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=identify&state=${state}`;
    console.log('Redirecting to Discord OAuth:', oauthUrl);
    res.redirect(oauthUrl);
  } catch (error) {
    console.error('Discord OAuth redirect error:', error);
    res.status(500).json({ message: 'Failed to initiate Discord OAuth' });
  }
});

router.get('/discord/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).json({ message: 'Missing authorization code' });
    if (!state) return res.status(400).json({ message: 'Missing state parameter' });

    // Verify JWT token from state
    let userId;
    try {
      const decoded = jwt.verify(decodeURIComponent(state), process.env.JWT_SECRET);
      userId = decoded.userId;
    } catch (error) {
      console.error('JWT verification error:', error);
      return res.redirect('https://gambling-website-frontend.vercel.app/profile?error=Invalid%20token');
    }

    // Exchange code for access token
    const tokenResponse = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${process.env.API_URL}/auth/discord/callback`,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token } = tokenResponse.data;

    // Get Discord user info
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const { id: discordId, username, discriminator, avatar } = userResponse.data;
    const discordName = discriminator === '0' ? username : `${username}#${discriminator}`;
    const avatarUrl = avatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png`
      : 'https://cdn.discordapp.com/embed/avatars/0.png';

    // Update user with Discord info
    const user = await User.findByIdAndUpdate(
      userId,
      { discordId, discordName, discordAvatar: avatarUrl },
      { new: true }
    );
    if (!user) {
      return res.redirect('https://gambling-website-frontend.vercel.app/profile?error=User%20not%20found');
    }

    res.redirect('https://gambling-website-frontend.vercel.app/profile?success=Discord%20connected');
  } catch (error) {
    console.error('Discord OAuth callback error:', error.response?.data || error.message);
    res.redirect('https://gambling-website-frontend.vercel.app/profile?error=Discord%20auth%20failed');
  }
});

module.exports = router;