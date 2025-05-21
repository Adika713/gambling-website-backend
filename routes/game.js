const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

const authenticate = (req, res, next) => {
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

const dealCard = () => {
  const suits = ['♠', '♥', '♣', '♦'];
  const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const suit = suits[Math.floor(Math.random() * suits.length)];
  const value = values[Math.floor(Math.random() * values.length)];
  return `${value}${suit}`;
};

const calculateHandValue = (hand) => {
  let value = 0;
  let aces = 0;
  for (const card of hand) {
    const rank = card.slice(0, -1);
    if (['J', 'Q', 'K'].includes(rank)) value += 10;
    else if (rank === 'A') aces += 1;
    else value += parseInt(rank);
  }
  for (let i = 0; i < aces; i++) {
    if (value + 11 <= 21) value += 11;
    else value += 1;
  }
  return value;
};

router.get('/blackjack/state', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const activeGame = user.gameHistory.find(
      (game) => game.game === 'Blackjack' && game.status === 'active'
    );
    if (!activeGame) return res.status(200).json(null);
    res.json({
      playerHand: activeGame.playerHand,
      dealerHand: activeGame.dealerHand,
      playerValue: calculateHandValue(activeGame.playerHand),
      dealerValue: calculateHandValue(activeGame.dealerHand),
      bet: activeGame.bet,
      status: activeGame.status,
      outcome: activeGame.outcome,
    });
  } catch (error) {
    console.error('Fetch blackjack state error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/blackjack/deal', authenticate, async (req, res) => {
  try {
    const { bet } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (bet <= 0 || bet > user.balance) {
      return res.status(400).json({ message: 'Invalid bet amount' });
    }

    const playerHand = [dealCard(), dealCard()];
    const dealerHand = [dealCard(), dealCard()];
    const playerValue = calculateHandValue(playerHand);
    const dealerValue = calculateHandValue(dealerHand);

    user.balance -= bet;
    user.gameHistory.push({
      game: 'Blackjack',
      bet,
      playerHand,
      dealerHand,
      status: 'active',
      outcome: null,
    });

    await user.save();

    res.json({
      playerHand,
      dealerHand,
      playerValue,
      dealerValue,
      bet,
      status: 'active',
      outcome: null,
    });
  } catch (error) {
    console.error('Blackjack deal error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/blackjack/hit', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const activeGame = user.gameHistory.find(
      (game) => game.game === 'Blackjack' && game.status === 'active'
    );
    if (!activeGame) return res.status(400).json({ message: 'No active game' });

    activeGame.playerHand.push(dealCard());
    const playerValue = calculateHandValue(activeGame.playerHand);

    if (playerValue > 21) {
      activeGame.status = 'completed';
      activeGame.outcome = 'Player busts';
      await user.save();
      return res.json({
        playerHand: activeGame.playerHand,
        dealerHand: activeGame.dealerHand,
        playerValue,
        dealerValue: calculateHandValue(activeGame.dealerHand),
        bet: activeGame.bet,
        status: 'completed',
        outcome: 'Player busts',
      });
    }

    await user.save();
    res.json({
      playerHand: activeGame.playerHand,
      dealerHand: activeGame.dealerHand,
      playerValue,
      dealerValue: calculateHandValue(activeGame.dealerHand),
      bet: activeGame.bet,
      status: 'active',
      outcome: null,
    });
  } catch (error) {
    console.error('Blackjack hit error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/blackjack/stand', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const activeGame = user.gameHistory.find(
      (game) => game.game === 'Blackjack' && game.status === 'active'
    );
    if (!activeGame) return res.status(400).json({ message: 'No active game' });

    while (calculateHandValue(activeGame.dealerHand) < 17) {
      activeGame.dealerHand.push(dealCard());
    }
    const playerValue = calculateHandValue(activeGame.playerHand);
    const dealerValue = calculateHandValue(activeGame.dealerHand);

    let outcome;
    if (dealerValue > 21) {
      user.balance += activeGame.bet * 2;
      outcome = 'Dealer busts';
    } else if (playerValue > dealerValue) {
      user.balance += activeGame.bet * 2;
      outcome = 'Player wins';
    } else if (playerValue < dealerValue) {
      outcome = 'Dealer wins';
    } else {
      user.balance += activeGame.bet;
      outcome = 'Push';
    }

    activeGame.status = 'completed';
    activeGame.outcome = outcome;
    await user.save();

    res.json({
      playerHand: activeGame.playerHand,
      dealerHand: activeGame.dealerHand,
      playerValue,
      dealerValue,
      bet: activeGame.bet,
      status: 'completed',
      outcome,
    });
  } catch (error) {
    console.error('Blackjack stand error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/roulette/spin', authenticate, async (req, res) => {
  try {
    const { bet, choice } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (bet <= 0 || bet > user.balance) {
      return res.status(400).json({ message: 'Invalid bet amount' });
    }
    if (!['red', 'black', 'green'].includes(choice)) {
      return res.status(400).json({ message: 'Invalid choice' });
    }

    const number = Math.floor(Math.random() * 37);
    const color = number === 0 ? 'green' : number % 2 === 0 ? 'red' : 'black';
    let outcome = choice === color ? 'Win' : 'Loss';

    user.balance -= bet;
    if (outcome === 'Win') {
      const multiplier = choice === 'green' ? 14 : 2;
      user.balance += bet * multiplier;
    }

    user.gameHistory.push({
      game: 'Roulette',
      bet,
      outcome: `${outcome} (${choice} on ${number} ${color})`,
    });

    await user.save();

    res.json({
      number,
      color,
      outcome,
      balance: user.balance,
    });
  } catch (error) {
    console.error('Roulette spin error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;