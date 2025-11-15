#!/usr/bin/env node

/**
 * Script to create API keys for IoT devices and external services
 * Usage: node scripts/createApiKey.js --name "Vehicle Fleet IoT" --scopes "telemetry:write,status:read"
 */

const crypto = require('crypto');
const Redis = require('ioredis');
require('dotenv').config();

const redis = new Redis(process.env.REDIS_URL || "redis://redis:6379");

async function createAPIKey(options = {}) {
  const {
    name = 'Unnamed API Key',
    scopes = ['telemetry:write'],
    expiresAt = null,
    description = ''
  } = options;

  const keyId = crypto.randomUUID();
  const rawKey = crypto.randomBytes(32).toString('hex');
  const hashedKey = crypto.createHash('sha256').update(rawKey).digest('hex');

  const keyData = {
    id: keyId,
    name,
    description,
    scopes: Array.isArray(scopes) ? scopes : scopes.split(','),
    isActive: true,
    createdAt: new Date().toISOString(),
    lastUsed: null,
    expiresAt: expiresAt ? expiresAt.toISOString() : null
  };

  // Store in Redis with 1 year TTL (can be extended)
  await redis.setex(`api_key:${hashedKey}`, 86400 * 365, JSON.stringify(keyData));

  console.log('API Key created successfully!');
  console.log('==============================');
  console.log(`Key ID: ${keyId}`);
  console.log(`Name: ${name}`);
  console.log(`Scopes: ${keyData.scopes.join(', ')}`);
  console.log(`Created: ${keyData.createdAt}`);
  if (expiresAt) {
    console.log(`Expires: ${expiresAt.toISOString()}`);
  }
  console.log('==============================');
  console.log(`API Key: ${rawKey}`);
  console.log('==============================');
  console.log('IMPORTANT: Save this API key securely. It cannot be retrieved again.');
  console.log('Usage: Include "X-API-Key: ' + rawKey + '" header in your requests.');

  return {
    keyId,
    apiKey: rawKey,
    keyData
  };
}

async function listAPIKeys() {
  console.log('Scanning for API keys...');
  
  // Get all API keys from Redis
  const keys = await redis.keys('api_key:*');
  
  if (keys.length === 0) {
    console.log('No API keys found.');
    return;
  }

  console.log(`Found ${keys.length} API key(s):`);
  console.log('==============================');

  for (const key of keys) {
    const data = await redis.get(key);
    if (data) {
      const keyData = JSON.parse(data);
      const hashedKey = key.replace('api_key:', '');
      
      console.log(`Name: ${keyData.name}`);
      console.log(`ID: ${keyData.id}`);
      console.log(`Scopes: ${keyData.scopes.join(', ')}`);
      console.log(`Created: ${keyData.createdAt}`);
      console.log(`Last Used: ${keyData.lastUsed || 'Never'}`);
      console.log(`Active: ${keyData.isActive}`);
      if (keyData.expiresAt) {
        console.log(`Expires: ${keyData.expiresAt}`);
      }
      console.log(`Key Hash: ${hashedKey.substring(0, 16)}...`);
      console.log('------------------------------');
    }
  }
}

async function revokeAPIKey(keyId) {
  console.log(`Revoking API key: ${keyId}`);
  
  // Find the key by scanning all keys
  const keys = await redis.keys('api_key:*');
  let found = false;

  for (const key of keys) {
    const data = await redis.get(key);
    if (data) {
      const keyData = JSON.parse(data);
      if (keyData.id === keyId) {
        keyData.isActive = false;
        keyData.revokedAt = new Date().toISOString();
        
        await redis.setex(key, 86400 * 365, JSON.stringify(keyData));
        
        console.log(`API key "${keyData.name}" has been revoked.`);
        found = true;
        break;
      }
    }
  }

  if (!found) {
    console.log(`API key with ID ${keyId} not found.`);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

async function main() {
  try {
    switch (command) {
      case 'create':
        const nameIndex = args.indexOf('--name');
        const scopesIndex = args.indexOf('--scopes');
        const descriptionIndex = args.indexOf('--description');
        const expiresIndex = args.indexOf('--expires');

        const options = {};
        
        if (nameIndex !== -1) {
          options.name = args[nameIndex + 1];
        }
        
        if (scopesIndex !== -1) {
          options.scopes = args[scopesIndex + 1];
        }
        
        if (descriptionIndex !== -1) {
          options.description = args[descriptionIndex + 1];
        }
        
        if (expiresIndex !== -1) {
          options.expiresAt = new Date(args[expiresIndex + 1]);
        }

        await createAPIKey(options);
        break;

      case 'list':
        await listAPIKeys();
        break;

      case 'revoke':
        const keyId = args[1];
        if (!keyId) {
          console.log('Usage: node createApiKey.js revoke <keyId>');
          process.exit(1);
        }
        await revokeAPIKey(keyId);
        break;

      default:
        console.log('Oltu Municipality Platform - API Key Management');
        console.log('===============================================');
        console.log('');
        console.log('Commands:');
        console.log('  create [options]    Create a new API key');
        console.log('  list               List all API keys');
        console.log('  revoke <keyId>     Revoke an API key');
        console.log('');
        console.log('Create Options:');
        console.log('  --name <name>           API key name (default: "Unnamed API Key")');
        console.log('  --scopes <scopes>       Comma-separated scopes (default: "telemetry:write")');
        console.log('  --description <desc>    API key description');
        console.log('  --expires <date>        Expiration date (ISO format)');
        console.log('');
        console.log('Available Scopes:');
        console.log('  telemetry:write         Submit vehicle telemetry data');
        console.log('  telemetry:read          Read telemetry data');
        console.log('  vehicles:read           Read vehicle information');
        console.log('  status:read             Read system status');
        console.log('');
        console.log('Examples:');
        console.log('  # Create IoT device key');
        console.log('  node createApiKey.js create --name "Vehicle Fleet IoT" --scopes "telemetry:write"');
        console.log('');
        console.log('  # Create monitoring key');
        console.log('  node createApiKey.js create --name "Monitoring Service" --scopes "telemetry:read,vehicles:read"');
        console.log('');
        console.log('  # List all keys');
        console.log('  node createApiKey.js list');
        console.log('');
        console.log('  # Revoke a key');
        console.log('  node createApiKey.js revoke abc-123-def-456');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

main();