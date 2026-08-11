export interface SSHKeys {
    privateKey: string;
    publicKey: string;
    source: string;
}
/**
 * Load SSH keys from environment variables or file system.
 * Tries multiple sources in order of preference.
 */
export declare function loadSSHKeys(): SSHKeys;
/**
 * Test if a private key can be parsed by ssh2.
 * This helps validate the key format before attempting to connect.
 */
export declare function validatePrivateKey(privateKey: string): {
    valid: boolean;
    error?: string;
};
//# sourceMappingURL=sshKeyHelper.d.ts.map