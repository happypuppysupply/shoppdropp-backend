import WebSocket from 'ws';
import { supabase } from '../db/supabase';
import axios from 'axios';

// WebSocket chat connections
const chatConnections = new Map<string, WebSocket>();

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function handleAIChatWebSocket(ws: WebSocket, userId: string) {
  console.log(`[AI-Chat-WS] Client connected: ${userId}`);
  
  const connectionId = `${userId}-${Date.now()}`;
  chatConnections.set(connectionId, ws);

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'chat') {
        await handleChatMessage(ws, userId, message);
      }
    } catch (error) {
      console.error('[AI-Chat-WS] Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Failed to process message'
      }));
    }
  });

  ws.on('close', () => {
    console.log(`[AI-Chat-WS] Client disconnected: ${userId}`);
    chatConnections.delete(connectionId);
  });

  ws.on('error', (error) => {
    console.error(`[AI-Chat-WS] Error for ${userId}:`, error);
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'WebSocket AI chat connected'
  }));
}

async function handleChatMessage(ws: WebSocket, userId: string, message: any) {
  const { content, conversation_history = [] } = message;
  
  try {
    // Get user's AI config
    const { data: configData } = await supabase
      .from('ai_configs')
      .select('*')
      .eq('user_id', userId)
      .single();

    // Get user's API key
    const { data: userData } = await supabase
      .from('users')
      .select('ai_api_key')
      .eq('id', userId)
      .single();

    const apiKey = configData?.api_key_encrypted || configData?.api_key || userData?.ai_api_key;
    
    if (!apiKey) {
      ws.send(JSON.stringify({
        type: 'error',
        error: 'AI not configured. Please set up your AI provider first.',
        code: 'AI_NOT_CONFIGURED'
      }));
      return;
    }

    const model = configData?.model || 'moonshotai/kimi-k2.5';
    
    // Build conversation
    const messages: ChatMessage[] = [
      ...conversation_history.slice(-10),
      { role: 'user', content }
    ];

    // Send "thinking" message
    ws.send(JSON.stringify({
      type: 'thinking',
      content: ''
    }));

    // Stream AI response
    const response = await streamAIResponse(ws, messages, apiKey, model);
    
    // Send complete message
    ws.send(JSON.stringify({
      type: 'complete',
      response: response
    }));

  } catch (error: any) {
    console.error('[AI-Chat-WS] Chat error:', error);
    ws.send(JSON.stringify({
      type: 'error',
      error: error.message || 'Chat failed'
    }));
  }
}

async function streamAIResponse(
  ws: WebSocket, 
  messages: ChatMessage[], 
  apiKey: string, 
  model: string
): Promise<string> {
  
  // For now, use non-streaming API and simulate streaming
  // In production, you'd use OpenRouter's streaming API
  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model,
        messages,
        temperature: 0.7,
        max_tokens: 4000,
        stream: true,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://shoppdropp.com',
          'X-Title': 'ShoppDropp AI Agent',
        },
        responseType: 'stream',
      }
    );

    let fullResponse = '';
    
    // Process stream chunks
    response.data.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            
            if (content) {
              fullResponse += content;
              // Send streaming chunk
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'chunk',
                  content: content
                }));
              }
            }
          } catch (e) {
            // Ignore parse errors for incomplete chunks
          }
        }
      }
    });

    // Wait for stream to complete
    await new Promise((resolve, reject) => {
      response.data.on('end', resolve);
      response.data.on('error', reject);
    });

    return fullResponse;

  } catch (error) {
    console.error('[AI-Chat-WS] Streaming error:', error);
    throw error;
  }
}
