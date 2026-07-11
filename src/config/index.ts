import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY || '',
  },
  
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    prices: {
      payg: process.env.STRIPE_PRICE_PAYG || '',
      growth: process.env.STRIPE_PRICE_GROWTH || '',
      agency: process.env.STRIPE_PRICE_AGENCY || '',
    },
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'change-this-secret',
  },
  
  worker: {
    image: process.env.WORKER_IMAGE || 'shoppdropp-worker:latest',
  },
};

if (!config.supabase.url || !config.supabase.serviceKey) {
  console.warn('Warning: Supabase credentials not configured');
}

if (!config.stripe.secretKey) {
  console.warn('Warning: Stripe secret key not configured');
}