import * as fs from 'fs';
import * as path from 'path';

export interface SSHKeys {
  privateKey: string;
  publicKey: string;
  source: string;
}

/**
 * Load SSH keys from environment variables or file system.
 * Tries multiple sources in order of preference.
 */
export function loadSSHKeys(): SSHKeys {
  // Try environment variables first
  const sshPrivateKeyFromEnv = process.env.SSH_PRIVATE_KEY;
  const sshPublicKeyFromEnv = process.env.SSH_PUBLIC_KEY;
  
  if (sshPrivateKeyFromEnv && sshPublicKeyFromEnv) {
    // Handle both literal \n and actual newlines
    let privateKey = sshPrivateKeyFromEnv.replace(/\\n/g, '\n').trim();
    const publicKey = sshPublicKeyFromEnv.trim();
    
    // Validate the key looks like an OpenSSH key
    if (privateKey.includes('-----BEGIN OPENSSH PRIVATE KEY-----')) {
      console.log('[SSH] Using keys from environment variables');
      console.log('[SSH] Private key length:', privateKey.length);
      console.log('[SSH] Public key length:', publicKey.length);
      return { privateKey, publicKey, source: 'env' };
    }
    
    console.warn('[SSH] Environment key does not look like OpenSSH format, trying file system...');
  }
  
  // Fallback to file system - ED25519 keys
  const sshDir = '/home/markjohnson44la44gigi/.openclaw/workspace/.secrets';
  
  try {
    const ed25519PrivatePath = path.join(sshDir, 'shoppdropp_render_ed25519');
    const ed25519PublicPath = path.join(sshDir, 'shoppdropp_render_key.pub');
    
    if (fs.existsSync(ed25519PrivatePath) && fs.existsSync(ed25519PublicPath)) {
      const privateKey = fs.readFileSync(ed25519PrivatePath, 'utf8').trim();
      const publicKey = fs.readFileSync(ed25519PublicPath, 'utf8').trim();
      
      console.log('[SSH] Using ED25519 keys from file system');
      console.log('[SSH] Private key length:', privateKey.length);
      console.log('[SSH] Private key format:', privateKey.substring(0, 50));
      
      return { privateKey, publicKey, source: 'file:ed25519' };
    }
  } catch (err) {
    console.warn('[SSH] Failed to read ED25519 keys from file system:', err);
  }
  
  // Last resort: RSA keys
  try {
    const rsaPrivatePath = path.join(sshDir, 'shoppdropp_render_rsa');
    const rsaPublicPath = path.join(sshDir, 'shoppdropp_render_rsa.pub');
    
    if (fs.existsSync(rsaPrivatePath) && fs.existsSync(rsaPublicPath)) {
      const privateKey = fs.readFileSync(rsaPrivatePath, 'utf8').trim();
      const publicKey = fs.readFileSync(rsaPublicPath, 'utf8').trim();
      
      console.log('[SSH] Using RSA keys from file system');
      console.log('[SSH] Private key length:', privateKey.length);
      
      return { privateKey, publicKey, source: 'file:rsa' };
    }
  } catch (err) {
    console.warn('[SSH] Failed to read RSA keys from file system:', err);
  }
  
  throw new Error(
    'SSH keys not found. Please set SSH_PRIVATE_KEY and SSH_PUBLIC_KEY environment variables, ' +
    'or ensure key files exist in /home/markjohnson44la44gigi/.openclaw/workspace/.secrets/'
  );
}

/**
 * Test if a private key can be parsed by ssh2.
 * This helps validate the key format before attempting to connect.
 */
export function validatePrivateKey(privateKey: string): { valid: boolean; error?: string } {
  if (!privateKey) {
    return { valid: false, error: 'Private key is empty' };
  }
  
  // Check for OpenSSH format marker
  if (privateKey.includes('-----BEGIN OPENSSH PRIVATE KEY-----')) {
    // Check if the key has the end marker
    if (!privateKey.includes('-----END OPENSSH PRIVATE KEY-----')) {
      return { valid: false, error: 'Missing END OPENSSH PRIVATE KEY marker' };
    }
    return { valid: true };
  }
  
  // Check for traditional PEM format (RSA)
  if (privateKey.includes('-----BEGIN RSA PRIVATE KEY-----')) {
    return { valid: true };
  }
  
  // Check for other PEM formats
  if (privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    return { valid: true };
  }
  
  if (privateKey.includes('-----BEGIN ENCRYPTED PRIVATE KEY-----')) {
    return { valid: false, error: 'Encrypted private keys are not supported. Please use an unencrypted key.' };
  }
  
  return { valid: false, error: 'Unknown key format. Supported formats: OpenSSH (ED25519), RSA PEM' };
}