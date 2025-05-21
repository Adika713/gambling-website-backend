const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 1000 },
  discordId: { type: String, unique: true, sparse: true },
  discordName: { type: String },
  discordAvatar: { type: String },
  gameHistory: [{
    game: String,
    bet: Number,
    outcome: String,
    timestamp: { type: Date, default: Date.now }
  }]
});

userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

module.exports = mongoose.model('User', userSchema);