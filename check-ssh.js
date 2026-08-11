// Check if SSH key format is valid
const fs = require('fs');

const privateKey = process.env.SSH_PRIVATE_KEY || '';
const publicKey = process.env.SSH_PUBLIC_KEY || '';

console.log('=== SSH KEY VALIDATION ===\n');

console.log('Private Key:');
console.log('- Length:', privateKey.length, 'characters');
console.log('- Has actual newlines (\\n):', privateKey.includes('\n'));
console.log('- Has escaped newlines (\\\\n):', privateKey.includes('\\n'));
console.log('- Has spaces:', privateKey.includes(' '));
console.log('- First 60 chars:', privateKey.substring(0, 60));
console.log('- Last 30 chars:', privateKey.substring(privateKey.length - 30));
console.log('');

console.log('Public Key:');
console.log('- Value:', publicKey);
console.log('');

// Check if keys match
if (privateKey.includes('ssh-ed25519')) {
  console.log('❌ ERROR: Private key contains public key text!');
  console.log('   The private key should NOT contain "ssh-ed25519"');
}

if (privateKey.includes('-----BEGIN OPENSSH PRIVATE KEY-----')) {
  console.log('✅ Private key has correct header');
} else {
  console.log('❌ Private key MISSING correct header');
}

if (privateKey.includes('-----END OPENSSH PRIVATE KEY-----')) {
  console.log('✅ Private key has correct footer');
} else {
  console.log('❌ Private key MISSING correct footer');
}

const lines = privateKey.split('\n');
console.log('\n- Number of lines:', lines.length);
console.log('- Expected: ~49 lines for ed25519 key');

if (lines.length > 2) {
  console.log('✅ Key appears to have proper line breaks');
} else {
  console.log('❌ Key is missing line breaks (only', lines.length, 'lines)');
}
