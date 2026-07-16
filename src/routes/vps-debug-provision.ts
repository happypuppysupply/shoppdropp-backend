import { Router, Request, Response } from 'express';
import { db } from '../db/supabase';
import { createVPSProvisioner } from '../services/vpsProvisioner';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Debug: Full provision with detailed logging
router.post('/debug-provision', async (req: Request, res: Response) => {
  const logs: string[] = [];
  const log = (msg: string) => {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    logs.push(line);
  };

  try {
    log('=== DEBUG PROVISION START ===');
    
    const userId = '4917a55a-59c3-4d41-af49-b95c678b63d1';
    const storeId = '000fdf9a-74b4-4069-b441-2a000b4f3b08';
    const workerId = uuidv4();
    
    log(`Worker ID: ${workerId}`);
    log(`User ID: ${userId}`);
    log(`Store ID: ${storeId}`);
    
    // Check env vars
    const hetznerToken = process.env.HETZNER_API_TOKEN;
    const sshPrivateKey = process.env.SSH_PRIVATE_KEY;
    const sshPublicKey = process.env.SSH_PUBLIC_KEY;
    
    log(`HETZNER_API_TOKEN: ${hetznerToken ? 'SET (' + hetznerToken.length + ' chars)' : 'NOT SET'}`);
    log(`SSH_PRIVATE_KEY: ${sshPrivateKey ? 'SET (' + sshPrivateKey.length + ' chars)' : 'NOT SET'}`);
    log(`SSH_PUBLIC_KEY: ${sshPublicKey ? 'SET (' + sshPublicKey.length + ' chars)' : 'NOT SET'}`);
    
    if (!hetznerToken || !sshPrivateKey) {
      return res.status(500).json({ error: 'Missing env vars', logs });
    }

    // Create worker
    log('Creating worker in database...');
    try {
      await db.createWorker({
        id: workerId,
        user_id: userId,
        store_id: storeId,
        status: 'provisioning',
      });
      log('Worker created successfully');
    } catch (e: any) {
      log(`ERROR creating worker: ${e.message}`);
      throw e;
    }

    // Create provisioner
    log('Creating VPS provisioner...');
    let provisioner;
    try {
      provisioner = createVPSProvisioner();
      log('Provisioner created');
    } catch (e: any) {
      log(`ERROR creating provisioner: ${e.message}`);
      throw e;
    }

    // Get AI config
    log('Loading AI config...');
    let aiConfig;
    try {
      aiConfig = await db.getAIConfig(userId);
      log(`AI config: ${aiConfig ? aiConfig.provider : 'NOT FOUND'}`);
    } catch (e: any) {
      log(`ERROR loading AI config: ${e.message}`);
    }
    
    const envVars: Record<string, string> = {};
    if (aiConfig) {
      envVars.AI_PROVIDER = aiConfig.provider || 'openrouter';
      envVars.AI_MODEL = aiConfig.model || 'moonshotai/kimi-k2.5';
      envVars.AI_API_KEY = aiConfig.api_key_encrypted || '';
      log(`AI env vars set: provider=${envVars.AI_PROVIDER}, model=${envVars.AI_MODEL}`);
    }

    // Provision synchronously with full error catching
    log('Starting provisionVPS...');
    try {
      const result = await provisioner.provisionVPS({
        workerId,
        storeId,
        userId,
        envVars,
      });
      
      log(`Provisioning result: ${JSON.stringify(result)}`);
      
      if (result.status === 'failed') {
        log(`FAILED: ${result.error}`);
        return res.status(500).json({ 
          success: false, 
          error: result.error,
          workerId,
          logs 
        });
      }
      
      log('SUCCESS!');
      return res.json({ 
        success: true, 
        workerId, 
        result,
        logs 
      });
      
    } catch (e: any) {
      log(`CRITICAL ERROR: ${e.message}`);
      log(`Stack: ${e.stack}`);
      return res.status(500).json({ 
        success: false, 
        error: e.message,
        stack: e.stack,
        workerId,
        logs 
      });
    }

  } catch (error: any) {
    log(`UNEXPECTED ERROR: ${error.message}`);
    res.status(500).json({ 
      error: error.message,
      stack: error.stack,
      logs 
    });
  }
});

export default router;
