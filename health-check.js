// Simple health check server
const http = require('http');
const port = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    port: port
  }));
});

server.listen(port, () => {
  console.log(`Health check server running on port ${port}`);
});
