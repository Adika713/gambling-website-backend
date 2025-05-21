const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

const deck = [
  { face: '2', value: 2 }, { face: '3', value: 3 }, { face: '4', value: 4 },
  { face: '5', value: 5 }, { face: '6', value: 6 }, { face: '7', value: 7 },
  { face: '8', value: 8 }, { face: '9', value: 9 }, { face: '10', value: 10 },
  { face: 'J', value: 10 }, { face: 'Q', value: 10 }, { face: 'K', value: 10 },
  { face: 'A', value: 11 },
].flatMap(card => ['♠', '♣', '♥', '♦'].map(suit => ({ ...card, face: `${card.face}${suit}` })));

const shuffle = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

const calculateHandValue = (hand) => {
  let value = hand.reduce((sum, card) => sum + card.value, 0);
  let aces = hand.filter(card => card.face.startsWith('A')).length;
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  return value;
};

router.post('/blackjack', authMiddleware, async (req, res) => {
  try {
    const { action, bet } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (action === 'deal') {
      if (bet > user.balance) return res.status(400).json({ message: 'Insufficient balance' });
      user.balance -= bet;
      const shuffledDeck = shuffle([...deck]);
      const playerCards = [shuffledDeck.pop(), shuffledDeck.pop()];
      const dealerCards = [shuffledDeck.pop(), shuffledDeck.pop()];
      user.gameState = { playerCards, dealerCards, bet, deck: shuffledDeck };
      await user.save();
      return res.json({
        playerCards,
        dealerCards: [dealerCards[0], { face: 'hidden', value: '?' }],
        balance: user.balance,
        status: 'playing',
      });
    }

    if (!user.gameState) return res.status(400).json({ message: 'No active game' });

    if (action === 'hit') {
      const { playerCards, dealerCards, bet, deck } = user.gameState;
      playerCards.push(deck.pop());
      const playerValue = calculateHandValue(playerCards);
      if (playerValue > 21) {
        user.gameHistory.push({ game: 'blackjack', bet, outcome: 'Loss', timestamp: new Date() });
        user.gameState = null;
        await user.save();
        return res.json({
          playerCards,
          dealerCards,
          balance: user.balance,
          status: 'bust',
          outcome: 'You busted! Game over.',
        });
      }
      user.gameState.playerCards = playerCards;
      user.gameState.deck = deck;
      await user.save();
      return res.json({ playerCards, dealerCards: [dealerCards[0], { face: 'hidden', value: '?' }], status: 'playing' });
    }

    if (action === 'stand') {
      const { playerCards, dealerCards, bet, deck } = user.gameState;
      let dealerValue = calculateHandValue(dealerCards);
      while (dealerValue < 17) {
        dealerCards.push(deck.pop());
        dealerValue = calculateHandValue(dealerCards);
      }
      const playerValue = calculateHandValue(playerCards);
      let outcome = '';
      if (dealerValue > 21 || playerValue > dealerValue) {
        outcome = 'You win!';
        user.balance += bet * 2;
      } else if (playerValue < dealerValue) {
        outcome = 'Dealer wins!';
      } else {
        outcome = 'Push!';
        user.balance += bet;
      }
      user.gameHistory.push({ game: 'blackjack', bet, outcome, timestamp: new Date() });
      user.gameState = null;
      await user.save();
      return res.json({ playerCards, dealerCards, balance: user.balance, status: 'over', outcome });
    }

    res.status(400).json({ message: 'Invalid action' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/roulette', authMiddleware, async (req, res) => {
  try {
    const { betAmount, betType } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (betAmount > user.balance) return res.status(400).json({ message: 'Insufficient balance' });

    user.balance -= betAmount;
    const result = Math.floor(Math.random() * 37); // 0-36
    const isRed = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(result);
    let outcome = 'Loss';
    if ((betType === 'red' && isRed) || (betType === 'black' && !isRed && result !== 0)) {
      user.balance += betAmount * 2;
      outcome = 'Win!';
    } else if (betType === 'number' && Number(req.body.number) === result) {
      user.balance += betAmount * 36;
      outcome = 'Win!';
    }
    user.gameHistory.push({ game: 'roulette', bet: betAmount, outcome, timestamp: new Date() });
    await user.save();
    res.json({ result: result === 0 ? '0' : isRed ? `${result} (Red)` : `${result} (Black)`, outcome, balance: user.balance });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;