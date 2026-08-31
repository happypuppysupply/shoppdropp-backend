#!/usr/bin/env ts-node
/**
 * Apify Actor Discovery Tool
 * 
 * This tool searches Apify Store for the best actors per category,
 * tests them with minimal runs, and generates the official ShoppDropp config.
 * 
 * Run: npx ts-node src/tools/discoverActors.ts
 */

import fetch from 'node-fetch';

const APIFY_API_BASE = 'https://api.apify.com/v2';
const APIFY_TOKEN = process.env.APIFY_TOKEN;

interface ApifyActor {
  id: string;
  name: string;
  username: string;
  title?: string;
  description?: string;
  isPublic: boolean;
  stats?: {
    totalRuns: number;
    publicActorRunCount: number;
  };
  currentPricing?: {
    pricingModel: string;
    pricePerUnitUsd: number;
    trialMinutes: number;
  };
}

interface ActorTest {
  id: string;
  name: string;
  status: 'pending' | 'testing' | 'success' | 'failed';
  error?: string;
  cost?: number;
  duration?: number;
  sampleOutput?: any;
}

// Categories we need actors for
const CATEGORIES = [
  { id: 'tiktok', search: 'tiktok scraper', minRuns: 1000 },
  { id: 'reddit', search: 'reddit scraper', minRuns: 500 },
  { id: 'google_trends', search: 'google trends', minRuns: 100 },
  { id: 'amazon', search: 'amazon product scraper', minRuns: 5000 },
  { id: 'youtube', search: 'youtube scraper', minRuns: 500 },
  { id: 'instagram', search: 'instagram scraper', minRuns: 500 },
];

async function apiRequest(endpoint: string, options: any = {}) {
  const url = `${APIFY_API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${APIFY_TOKEN}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Apify API error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Search Apify Store for actors
 */
async function searchActors(query: string, limit: number = 10): Promise<ApifyActor[]> {
  console.log(`\n🔍 Searching: "${query}"`);
  
  const params = new URLSearchParams();
  params.append('search', query);
  params.append('type', 'apify');
  params.append('sortBy', 'mostPopular');
  params.append('limit', String(limit));
  
  const data = await apiRequest(`/store?${params.toString()}`);
  const items = data.data?.items || [];
  
  console.log(`   Found ${items.length} actors`);
  
  return items.map((item: any) => ({
    id: item.id,
    name: item.name,
    username: item.username,
    title: item.title || item.name,
    description: item.description,
    isPublic: item.isPublic,
    stats: item.stats,
    currentPricing: item.currentPricing,
  }));
}

/**
 * Test an actor with a minimal run
 */
async function testActor(actor: ApifyActor, testInput: any): Promise<ActorTest> {
  const result: ActorTest = {
    id: actor.id,
    name: actor.title || actor.name,
    status: 'testing',
  };

  console.log(`   🧪 Testing: ${actor.username}/${actor.name}`);
  
  try {
    // Start a test run
    const startTime = Date.now();
    
    const runData = await apiRequest(`/acts/${actor.id}/runs`, {
      method: 'POST',
      body: JSON.stringify({
        ...testInput,
        memory: 512, // Low memory for test
        timeout: 120, // 2 min max
      }),
    });

    const runId = runData.data?.id;
    if (!runId) {
      throw new Error('No run ID returned');
    }

    // Wait for completion (up to 2 minutes)
    let completed = false;
    let attempts = 0;
    const maxAttempts = 24; // 2 minutes (5 second intervals)
    
    while (!completed && attempts < maxAttempts) {
      await delay(5000);
      attempts++;
      
      const statusData = await apiRequest(`/actor-runs/${runId}`);
      const status = statusData.data?.status;
      
      if (status === 'SUCCEEDED') {
        completed = true;
        
        // Get sample output
        const datasetId = statusData.data?.defaultDatasetId;
        if (datasetId) {
          try {
            const itemsData = await apiRequest(`/datasets/${datasetId}/items?format=json&limit=3`);
            result.sampleOutput = itemsData.slice(0, 2); // First 2 items
          } catch (e) {
            // Don't fail if we can't get items
          }
        }
        
        result.duration = Math.round((Date.now() - startTime) / 1000);
        result.status = 'success';
        
        console.log(`   ✅ SUCCESS (${result.duration}s)`);
        
      } else if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED_OUT') {
        completed = true;
        result.status = 'failed';
        result.error = `Run ${status}`;
        
        console.log(`   ❌ FAILED (${status})`);
      }
      // else: still running, keep waiting
    }
    
    if (!completed) {
      result.status = 'failed';
      result.error = 'Timeout after 2 minutes';
      console.log(`   ⏱️ TIMEOUT`);
    }

  } catch (error: any) {
    result.status = 'failed';
    result.error = error.message;
    console.log(`   ❌ ERROR: ${error.message}`);
  }

  return result;
}

/**
 * Generate test input for each actor type
 */
function getTestInput(categoryId: string): any {
  switch (categoryId) {
    case 'tiktok':
      return {
        hashtags: ['kitchen'],
        resultsPerPage: 5,
        maxResults: 5,
      };
    case 'reddit':
      return {
        subreddits: ['homedecor'],
        sort: 'hot',
        time: 'day',
        maxPosts: 5,
      };
    case 'google_trends':
      return {
        searchTerms: ['buy kitchen gadget'],
        timeRange: 'today-1-m',
        geo: 'US',
      };
    case 'amazon':
      return {
        searchTerms: ['kitchen gadget'],
        maxResults: 5,
      };
    case 'youtube':
      return {
        searchKeywords: ['kitchen gadget review'],
        maxResults: 5,
      };
    case 'instagram':
      return {
        hashtags: ['kitchentok'],
        resultsLimit: 5,
      };
    default:
      return {};
  }
}

/**
 * Main discovery process
 */
async function discoverActors() {
  console.log('🚀 Apify Actor Discovery Tool');
  console.log('==============================\n');
  
  if (!APIFY_TOKEN) {
    console.error('❌ APIFY_TOKEN environment variable required!');
    console.log('Run: export APIFY_TOKEN=your_token_here');
    process.exit(1);
  }

  const results: Record<string, any> = {};

  for (const category of CATEGORIES) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📂 Category: ${category.id.toUpperCase()}`);
    console.log(`   Search: "${category.search}"`);
    console.log(`   Min Runs: ${category.minRuns}`);
    console.log('='.repeat(60));

    // Search for actors
    const actors = await searchActors(category.search, 5);
    
    if (actors.length === 0) {
      console.log('   ⚠️ No actors found!');
      results[category.id] = { error: 'No actors found' };
      continue;
    }

    // Display options
    console.log('\n   Options found:');
    actors.forEach((actor, i) => {
      const runs = actor.stats?.publicActorRunCount || 0;
      const price = actor.currentPricing?.pricePerUnitUsd || 0;
      console.log(`   ${i + 1}. ${actor.username}/${actor.name}`);
      console.log(`      ID: ${actor.id}`);
      console.log(`      Runs: ${runs.toLocaleString()}`);
      console.log(`      Price: ${price > 0 ? '$' + price.toFixed(2) : 'Free/Pay-per-use'}`);
      console.log(`      Public: ${actor.isPublic ? '✅' : '❌'}`);
    });

    // Test top 3 actors
    console.log('\n   Testing top actors...');
    const testResults: ActorTest[] = [];
    const testInput = getTestInput(category.id);
    
    for (let i = 0; i < Math.min(3, actors.length); i++) {
      const test = await testActor(actors[i], testInput);
      testResults.push(test);
      
      // Add delay between tests
      if (i < Math.min(3, actors.length) - 1) {
        await delay(2000);
      }
    }

    // Pick best actor
    const successful = testResults.filter(t => t.status === 'success');
    
    if (successful.length > 0) {
      const best = successful[0];
      results[category.id] = {
        selected: best.id,
        tests: testResults.map(t => ({
          id: t.id,
          status: t.status,
          error: t.error,
          duration: t.duration,
        })),
      };
      
      console.log(`\n   🏆 SELECTED: ${best.id}`);
      console.log(`   Status: ✅ Working (${best.duration}s)`);
    } else {
      results[category.id] = {
        selected: null,
        tests: testResults,
        error: 'No working actors found',
      };
      
      console.log(`\n   ⚠️ No working actors found for ${category.id}`);
    }
  }

  // Generate config
  console.log('\n\n' + '='.repeat(60));
  console.log('📊 DISCOVERY COMPLETE');
  console.log('='.repeat(60));
  
  const config: any = {
    version: '1.0.0',
    discoveredAt: new Date().toISOString(),
    actors: {},
  };

  for (const [catId, result] of Object.entries(results)) {
    const r = result as any;
    if (r.selected) {
      config.actors[catId] = {
        id: r.selected,
        status: 'verified',
      };
      console.log(`✅ ${catId}: ${r.selected}`);
    } else {
      config.actors[catId] = {
        id: null,
        status: 'failed',
        error: r.error,
      };
      console.log(`❌ ${catId}: No working actor found`);
    }
  }

  // Save to file
  const fs = require('fs');
  const path = require('path');
  const configPath = path.join(__dirname, '../../config/apify-actors-verified.json');
  
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  
  console.log(`\n💾 Config saved to: ${configPath}`);
  
  return config;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run if called directly
if (require.main === module) {
  discoverActors()
    .then(() => {
      console.log('\n✨ Done!');
      process.exit(0);
    })
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

export { discoverActors };
