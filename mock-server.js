// Simple Node.js mock server for testing Session Tracker extension
// Run with: node mock-server.js

const http = require('http');
const url = require('url');

// In-memory storage for testing
const problems = new Map();
const events = [];

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const method = req.method;

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  // Handle preflight requests
  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Parse request body
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    try {
      const requestData = body ? JSON.parse(body) : {};

      // Route handling
      if (path === '/api/v1/problems/detect' && method === 'POST') {
        handleProblemDetect(req, res, requestData);
      } else if (path === '/api/v1/problems/events' && method === 'POST') {
        handleProblemEvents(req, res, requestData);
      } else if (path === '/api/health' && method === 'GET') {
        handleHealthCheck(req, res);
      } else if (path === '/api/stats' && method === 'GET') {
        handleStats(req, res);
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
      }
    } catch (error) {
      console.error('Error processing request:', error);
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });
});

function handleProblemDetect(req, res, data) {
  console.log('🔍 Problem Detection Request:', data);

  // Validate required fields
  if (!data.userId || !data.platform || !data.problemTitle) {
    res.writeHead(400);
    res.end(JSON.stringify({ 
      error: 'Missing required fields: userId, platform, problemTitle' 
    }));
    return;
  }

  // Generate a unique problem ID
  const problemId = `problem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Store problem info
  problems.set(problemId, {
    problemId,
    userId: data.userId,
    platform: data.platform,
    problemTitle: data.problemTitle,
    problemUrl: data.problemUrl,
    detectedAt: new Date().toISOString(),
    expectedTime: Math.floor(Math.random() * 1800) + 600 // 10-40 minutes in seconds
  });

  // Simulate processing delay
  setTimeout(() => {
    const response = {
      problemId,
      expectedTime: problems.get(problemId).expectedTime,
      message: 'Problem detected successfully'
    };

    console.log('✅ Problem Detection Response:', response);
    res.writeHead(200);
    res.end(JSON.stringify(response));
  }, 100);
}

function handleProblemEvents(req, res, data) {
  console.log('📊 Problem Event Request:', data);

  // Validate required fields
  if (!data.eventType) {
    res.writeHead(400);
    res.end(JSON.stringify({ 
      error: 'Missing required field: eventType' 
    }));
    return;
  }

  // Store event
  const event = {
    id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    eventType: data.eventType,
    data: data.data || data,
    timestamp: new Date().toISOString(),
    receivedAt: new Date().toISOString()
  };

  events.push(event);

  // Keep only last 1000 events
  if (events.length > 1000) {
    events.splice(0, events.length - 1000);
  }

  // Simulate processing delay
  setTimeout(() => {
    const response = {
      eventId: event.id,
      message: 'Event processed successfully',
      timestamp: event.timestamp
    };

    console.log('✅ Event Response:', response);
    res.writeHead(200);
    res.end(JSON.stringify(response));
  }, 50);
}

function handleHealthCheck(req, res) {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    problems: problems.size,
    events: events.length
  };

  res.writeHead(200);
  res.end(JSON.stringify(health));
}

function handleStats(req, res) {
  const stats = {
    timestamp: new Date().toISOString(),
    problems: {
      total: problems.size,
      byPlatform: Array.from(problems.values()).reduce((acc, problem) => {
        acc[problem.platform] = (acc[problem.platform] || 0) + 1;
        return acc;
      }, {})
    },
    events: {
      total: events.length,
      byType: events.reduce((acc, event) => {
        acc[event.eventType] = (acc[event.eventType] || 0) + 1;
        return acc;
      }, {})
    },
    recentEvents: events.slice(-10).map(event => ({
      eventType: event.eventType,
      timestamp: event.timestamp
    }))
  };

  res.writeHead(200);
  res.end(JSON.stringify(stats));
}

// Error handling
server.on('error', (error) => {
  console.error('Server error:', error);
});

// Start server
const PORT = process.env.PORT || 8082;
server.listen(PORT, () => {
  console.log(`🚀 Mock server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📈 Stats: http://localhost:${PORT}/api/stats`);
  console.log(`🔍 Problem detection: POST http://localhost:${PORT}/api/v1/problems/detect`);
  console.log(`📊 Problem events: POST http://localhost:${PORT}/api/v1/problems/events`);
  console.log('\nPress Ctrl+C to stop the server\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Log all requests
server.on('request', (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
});
