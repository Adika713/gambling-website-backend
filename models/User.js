const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  discordName: String,
  email: { type: String, required: true, unique: true },
  password: String,
  balance: { type: Number, default: 0 },
  gameHistory: [{ game: String, amount: Number, outcome: String, date: Date }],
});

userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

module.exports = mongoose.model('User', userSchema);