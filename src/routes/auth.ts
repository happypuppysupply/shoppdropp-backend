import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { db } from '../db/supabase';
import { generateToken } from '../middleware/auth';
import Stripe from 'stripe';
import { config } from '../config';

const router = Router();
const stripe = new Stripe(config.stripe.secretKey, { apiVersion: '2024-06-20' });

// Register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { email, plan = 'payg' } = req.body;

    // Check if user exists
    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create Stripe customer
    const customer = await stripe.customers.create({ email });

    // Create user
    const user = await db.createUser({
      email,
      stripe_customer_id: customer.id,
      plan,
      status: 'active',
    });

    const token = generateToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        status: user.status,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login (simple version - in production use proper password hashing)
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
], async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const user = await db.getUserByEmail(email);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        plan: user.plan,
        status: user.status,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

export default router;