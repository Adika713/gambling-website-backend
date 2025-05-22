const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
  discordId: { type: String, unique: true, sparse: true },
  discordName: String,
  discordAvatar: String, // New field for PFP URL
  email: { type: String, required: true, unique: true },
  password: String,
  balance: { type: Number, default: 0 },
  gameHistory: [{ game: String, amount: Number, outcome: String, date: Date }],
});
module.exports = mongoose.model('User', userSchema);