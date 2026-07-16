import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { db } from '../db/supabase';
import { User } from '../types';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

// Create Supabase client for token verification
const supabase = config.supabase.url && config.supabase.serviceKey
  ? createClient(config.supabase.url, config.supabase.serviceKey)
  : null;

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    let userId: string | null = null;

    // Try 1: Verify as our custom JWT
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as { userId: string };
      userId = decoded.userId;
      console.log('Auth: Custom JWT verified, userId:', userId);
    } catch (e) {
      // Not our custom JWT, try Supabase
      console.log('Auth: Custom JWT failed, trying Supabase...');
    }

    // Try 2: Verify as Supabase JWT
    if (!userId && supabase) {
      try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
          console.log('Auth: Supabase token validation failed:', error?.message);
        } else {
          userId = user.id;
          console.log('Auth: Supabase JWT verified, userId:', userId);
        }
      } catch (e: any) {
        console.log('Auth: Supabase verification error:', e.message);
      }
    }

    if (!userId) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get or create user in our database
    let user = await db.getUserById(userId);
    
    if (!user && supabase) {
      // User exists in Supabase but not in our DB - create them
      try {
        const { data: { user: supabaseUser } } = await supabase.auth.getUser(token);
        if (supabaseUser?.email) {
          console.log('Auth: Creating new user from Supabase:', supabaseUser.email);
          user = await db.createUser({
            id: supabaseUser.id,
            email: supabaseUser.email,
            plan: 'payg',
            status: 'active',
          });
        }
      } catch (e: any) {
        console.log('Auth: Failed to create user from Supabase:', e.message);
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

export const generateToken = (userId: string): string => {
  return jwt.sign({ userId }, config.jwt.secret, { expiresIn: '7d' });
};
