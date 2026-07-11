import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth';
import { db } from '../db/supabase';
import { config } from '../config';
import Stripe from 'stripe';

const router = Router();
const stripe = new Stripe(config.stripe.secretKey, { apiVersion: '2024-06-20' });

// Create checkout session
router.post('/checkout', authenticate, [
  body('plan').isIn(['growth', 'agency']),
], async (req: Request, res: Response) => {
  try {
    const { plan } = req.body;
    const priceId = config.stripe.prices[plan as keyof typeof config.stripe.prices];
    
    if (!priceId) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const session = await stripe.checkout.sessions.create({
      customer: req.user!.stripe_customer_id!,
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: `${req.headers.origin}/dashboard?success=true`,
      cancel_url: `${req.headers.origin}/dashboard?canceled=true`,
      metadata: { plan },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Get subscription status
router.get('/subscription', authenticate, async (req: Request, res: Response) => {
  try {
    if (!req.user!.stripe_subscription_id) {
      return res.json({ plan: req.user!.plan, status: 'inactive' });
    }

    const subscription = await stripe.subscriptions.retrieve(req.user!.stripe_subscription_id);
    
    res.json({
      plan: req.user!.plan,
      status: subscription.status,
      current_period_end: subscription.current_period_end,
      cancel_at_period_end: subscription.cancel_at_period_end,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// Webhook
router.post('/webhook', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle events
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      
      // Find user by customer ID
      const { data: users, error } = await (await import('../db/supabase')).db.getUserByStripeCustomerId(session.customer as string);
      
      if (users && !error) {
        await (await import('../db/supabase')).db.updateUser(users.id, {
          stripe_subscription_id: session.subscription as string,
          plan: (session.metadata?.plan as 'payg' | 'growth' | 'agency') || 'growth',
        });
      }
      break;
    }
    
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      console.log('Payment failed:', invoice.id);
      break;
    }
    
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      // Downgrade to payg
      const { data: users } = await (await import('../db/supabase')).db.getUserByStripeCustomerId(subscription.customer as string);
      if (users) {
        await (await import('../db/supabase')).db.updateUser(users.id, {
          stripe_subscription_id: undefined,
          plan: 'payg' as const,
        });
      }
      break;
    }
  }

  res.json({ received: true });
});

export default router;