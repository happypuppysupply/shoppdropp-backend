// Diagnostic script for Render deployment
const http = require('http');
const PORT = process.env.PORT || 10000;

console.log('=== RENDER DIAGNOSTIC ===');
console.log('PORT:', PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('SUPABASE_URL set:', !!process.env.SUPABASE_URL);
console.log('SUPABASE_SERVICE_KEY set:', !!process.env.SUPABASE_SERVICE_KEY);
console.log('JWT_SECRET set:', !!process.env.JWT_SECRET);
console.log('========================');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ 
    status: 'ok', 
    message: 'Render diagnostic passed!',
    port: PORT,
    env: {
      nodeEnv: process.env.NODE_ENV,
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_KEY,
      hasJwtSecret: !!process.env.JWT_SECRET
    }
  }));
});

server.listen(PORT, () => {
  console.log(`✅ Diagnostic server running on port ${PORT}`);
});
