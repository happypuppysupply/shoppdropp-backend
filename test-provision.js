#!/usr/bin/env node
/**
 * VPS Provisioning Test Script
 * Tests each step of the provisioning process
 */

const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

// Config
const SUPABASE_URL = 'https://tdokcqkdtwzhjvdkspls.supabase.co';
const SUPABASE_KEY = 'sb_secret_x6lrusDKJ6R5w_FGt-wzBw_PwKkpRyh';
// Token must be set via environment variable
const HETZNER_TOKEN = process.env.HETZNER_API_TOKEN;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Test results
const results = {
  passed: [],
  failed: [],
  warnings: []
};

function log(section, message, type = 'info') {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warn' ? '⚠️' : 'ℹ️';
  console.log(`[${timestamp}] ${prefix} [${section}] ${message}`);
  
  if (type === 'success') results.passed.push(`${section}: ${message}`);
  if (type === 'error') results.failed.push(`${section}: ${message}`);
  if (type === 'warn') results.warnings.push(`${section}: ${message}`);
}

async function testEnvironment() {
  log('ENV', 'Testing environment variables...');
  
  const vars = ['HETZNER_API_TOKEN', 'SSH_PRIVATE_KEY', 'SSH_PUBLIC_KEY'];
  for (const v of vars) {
    const val = process.env[v];
    if (!val) {
      log('ENV', `${v} is NOT SET`, 'error');
    } else {
      log('ENV', `${v} is set (${val.length} chars)`, 'success');
    }
  }
}

async function testDatabase() {
  log('DB', 'Testing database connection...');
  
  try {
    const { data: workers, error } = await supabase.from('workers').select('*').limit(1);
    if (error) throw error;
    
    if (workers && workers[0]) {
      const cols = Object.keys(workers[0]);
      log('DB', `Connected. Worker columns: ${cols.join(', ')}`, 'success');
      
      // Check required columns
      const required = ['id', 'user_id', 'store_id', 'status', 'hetzner_server_id'];
      const missing = required.filter(c => !cols.includes(c));
      if (missing.length > 0) {
        log('DB', `Missing columns: ${missing.join(', ')}`, 'warn');
      }
    } else {
      log('DB', 'Connected but no workers found', 'success');
    }
  } catch (e) {
    log('DB', `Connection failed: ${e.message}`, 'error');
  }
}

async function testHetznerAPI() {
  log('HETZNER', 'Testing Hetzner API...');
  
  try {
    const response = await axios.get('https://api.hetzner.cloud/v1/servers', {
      headers: { 'Authorization': '***' + HETZNER_TOKEN }
    });
    
    const servers = response.data.servers || [];
    log('HETZNER', `API working. Found ${servers.length} servers`, 'success');
    
    if (servers.length > 0) {
      servers.forEach(s => {
        log('HETZNER', `  - ${s.name}: ${s.status} (${s.public_net?.ipv4?.ip || 'no IP'})`);
      });
    }
  } catch (e) {
    log('HETZNER', `API failed: ${e.response?.data?.error?.message || e.message}`, 'error');
  }
}

async function testServerCreation() {
  log('SERVER', 'Testing server creation...');
  
  const testName = `test-${uuidv4().slice(0, 8)}`;
  let serverId = null;
  
  try {
    // Create server
    log('SERVER', `Creating test server: ${testName}...`);
    const response = await axios.post('https://api.hetzner.cloud/v1/servers', {
      name: testName,
      server_type: 'cpx12',
      image: 'ubuntu-22.04',
      location: 'nbg1'
    }, {
      headers: { 
        'Authorization': '***' + HETZNER_TOKEN,
        'Content-Type': 'application/json'
      }
    });
    
    serverId = response.data.server.id;
    const ip = response.data.server.public_net?.ipv4?.ip;
    log('SERVER', `Created server ${serverId} with IP ${ip || 'pending'}`, 'success');
    
    // Wait for server to be ready
    log('SERVER', 'Waiting for server to be ready (max 2 mins)...');
    let ready = false;
    let attempts = 0;
    
    while (!ready && attempts < 24) {
      await new Promise(r => setTimeout(r, 5000));
      attempts++;
      
      const statusRes = await axios.get(`https://api.hetzner.cloud/v1/servers/${serverId}`, {
        headers: { 'Authorization': '***' + HETZNER_TOKEN }
      });
      
      const status = statusRes.data.server.status;
      log('SERVER', `  Attempt ${attempts}: status = ${status}`);
      
      if (status === 'running') {
        ready = true;
        const finalIp = statusRes.data.server.public_net?.ipv4?.ip;
        log('SERVER', `Server ready! IP: ${finalIp}`, 'success');
      }
    }
    
    if (!ready) {
      log('SERVER', 'Server did not become ready in time', 'error');
    }
    
  } catch (e) {
    log('SERVER', `Creation failed: ${e.response?.data?.error?.message || e.message}`, 'error');
  } finally {
    // Cleanup
    if (serverId) {
      log('SERVER', `Cleaning up test server ${serverId}...`);
      try {
        await axios.delete(`https://api.hetzner.cloud/v1/servers/${serverId}`, {
          headers: { 'Authorization': '***' + HETZNER_TOKEN }
        });
        log('SERVER', 'Test server deleted', 'success');
      } catch (e) {
        log('SERVER', `Cleanup failed: ${e.message}`, 'warn');
      }
    }
  }
}

async function testWorkerCreation() {
  log('WORKER', 'Testing worker creation in database...');
  
  const workerId = uuidv4();
  const userId = '4917a55a-59c3-4d41-af49-b95c678b63d1';
  const storeId = '000fdf9a-74b4-4069-b441-2a000b4f3b08';
  
  try {
    const { data, error } = await supabase.from('workers').insert({
      id: workerId,
      user_id: userId,
      store_id: storeId,
      status: 'provisioning'
    }).select().single();
    
    if (error) throw error;
    
    log('WORKER', `Created worker ${workerId.slice(0, 8)}...`, 'success');
    
    // Update with hetzner_id
    const { error: updateError } = await supabase.from('workers').update({
      hetzner_server_id: '12345',
      status: 'configuring'
    }).eq('id', workerId);
    
    if (updateError) {
      log('WORKER', `Update failed: ${updateError.message}`, 'error');
    } else {
      log('WORKER', 'Updated worker with Hetzner ID', 'success');
    }
    
    // Cleanup
    await supabase.from('workers').delete().eq('id', workerId);
    log('WORKER', 'Test worker cleaned up', 'success');
    
  } catch (e) {
    log('WORKER', `Test failed: ${e.message}`, 'error');
  }
}

async function runAllTests() {
  console.log('========================================');
  console.log('VPS Provisioning Test Suite');
  console.log('========================================\n');
  
  await testEnvironment();
  console.log('');
  
  await testDatabase();
  console.log('');
  
  await testHetznerAPI();
  console.log('');
  
  await testWorkerCreation();
  console.log('');
  
  await testServerCreation();
  console.log('');
  
  // Summary
  console.log('========================================');
  console.log('Test Summary');
  console.log('========================================');
  console.log(`✅ Passed: ${results.passed.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⚠️  Warnings: ${results.warnings.length}`);
  
  if (results.failed.length > 0) {
    console.log('\nFailed Tests:');
    results.failed.forEach(f => console.log(`  - ${f}`));
  }
  
  process.exit(results.failed.length > 0 ? 1 : 0);
}

runAllTests().catch(e => {
  console.error('Test suite failed:', e);
  process.exit(1);
});
