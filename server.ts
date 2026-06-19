import express from 'express';
import { createServer as createHttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'motarchats-luxury-secret-key-24gd72g';

// Ensure necessary directories exist
const DATA_DIR = path.resolve('data');
const UPLOADS_DIR = path.resolve('uploads');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Setup local db
interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  avatar: string;
  online: boolean;
  lastSeen?: string;
}

interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'video' | 'file';
  mediaUrl?: string;
  mediaMimeType?: string;
  createdAt: string;
  seenBy: string[]; // List of user IDs who have seen the message
}

interface Chat {
  id: string;
  isGroup: boolean;
  name?: string; // Null/empty for direct chat
  members: string[]; // List of user IDs
  admins: string[]; // List of admins
  lastMessageId?: string;
  updatedAt: string;
}

interface LocalDB {
  users: User[];
  chats: Chat[];
  messages: Message[];
}

class Database {
  private dbPath = path.resolve('data/db.json');
  data: LocalDB = { users: [], chats: [], messages: [] };

  constructor() {
    this.load();
    this.seedDefaultUsers();
  }

  private load() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf-8');
        this.data = JSON.parse(raw);
        if (!this.data.users) this.data.users = [];
        if (!this.data.chats) this.data.chats = [];
        if (!this.data.messages) this.data.messages = [];
      } else {
        this.save();
      }
    } catch (e) {
      console.error('Error loading DB, initializing empty:', e);
    }
  }

  save() {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error saving DB:', e);
    }
  }

  private seedDefaultUsers() {
    // 1. Motarchats AI Support Agent
    const aiSupport: User = {
      id: 'ai-bot',
      name: 'Motarchats AI',
      email: 'ai@motarchats.com',
      passwordHash: hashPassword(crypto.randomBytes(16).toString('hex')),
      avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=60',
      online: true,
      lastSeen: new Date().toISOString(),
    };

    // 2. Sophia Gold
    const sophia: User = {
      id: 'user-sophia',
      name: 'Sophia Gold (Product Design)',
      email: 'sophia@example.com',
      passwordHash: hashPassword('12345678'),
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=60',
      online: false,
      lastSeen: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 mins ago
    };

    // 3. Marcus Teal
    const marcus: User = {
      id: 'user-marcus',
      name: 'Marcus Teal (Technical Lead)',
      email: 'marcus@example.com',
      passwordHash: hashPassword('12345678'),
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=60',
      online: false,
      lastSeen: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    };

    // 4. Yara Smith
    const yara: User = {
      id: 'user-yara',
      name: 'Yara Smith (QA Lead)',
      email: 'yara@example.com',
      passwordHash: hashPassword('12345678'),
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=60',
      online: true,
      lastSeen: new Date().toISOString(),
    };

    const seededIds = [aiSupport.id, sophia.id, marcus.id, yara.id];
    let changed = false;

    [aiSupport, sophia, marcus, yara].forEach(seedUser => {
      const idx = this.data.users.findIndex(u => u.id === seedUser.id);
      if (idx === -1) {
        this.data.users.push(seedUser);
        changed = true;
      }
    });

    if (changed) {
      this.save();
    }
  }
}

const db = new Database();

// Cryptography Helpers
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function signToken(userId: string): string {
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days expiration
  const payload = `${userId}.${expiresAt}`;
  const hmac = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
  return `${payload}.${hmac}`;
}

function verifyToken(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [userId, expiresAtStr, signature] = parts;
    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt) || expiresAt < Date.now()) return null;
    const payload = `${userId}.${expiresAtStr}`;
    const expectedHmac = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
    if (signature !== expectedHmac) return null;
    return userId;
  } catch {
    return null;
  }
}

// AI Integration
const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

// Start Express and Socket.IO
async function start() {
  const app = express();
  const httpServer = createHttpServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  app.use(express.json({ limit: '50mb' }));
  app.use('/uploads', express.static(UPLOADS_DIR));

  // Request logs middleware
  app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.path}`);
    next();
  });

  // Authentication Middleware
  const authMiddleware = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }
    const token = authHeader.split(' ')[1];
    const userId = verifyToken(token);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
    const user = db.data.users.find(u => u.id === userId);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: User not found' });
    }
    req.user = user;
    next();
  };

  // ----- REST REST API ENDPOINTS -----

  // Register
  app.post('/api/auth/register', (req, res) => {
    try {
      const { name, email, password, avatar } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Missing name, email, or password' });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const existing = db.data.users.find(u => u.email === normalizedEmail);
      if (existing) {
        return res.status(400).json({ error: 'Email already exists' });
      }

      const newUser: User = {
        id: crypto.randomUUID(),
        name: name.trim(),
        email: normalizedEmail,
        passwordHash: hashPassword(password),
        avatar: avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`,
        online: false,
        lastSeen: new Date().toISOString(),
      };

      db.data.users.push(newUser);
      db.save();

      const token = signToken(newUser.id);
      const { passwordHash, ...userResponse } = newUser;
      return res.status(201).json({ success: true, token, user: userResponse });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Login
  app.post('/api/auth/login', (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Missing email or password' });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const user = db.data.users.find(u => u.email === normalizedEmail);
      if (!user || user.passwordHash !== hashPassword(password)) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = signToken(user.id);
      const { passwordHash, ...userResponse } = user;
      return res.json({ success: true, token, user: userResponse });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Me
  app.get('/api/auth/me', authMiddleware, (req: any, res) => {
    const { passwordHash, ...userResponse } = req.user;
    return res.json({ success: true, user: userResponse });
  });

  // Search users for starts/joining conversations
  app.get('/api/users', authMiddleware, (req: any, res) => {
    try {
      const search = (req.query.search || '').toString().toLowerCase().trim();
      const currentUserId = req.user.id;

      // Filter other users matching name/email
      let filtered = db.data.users.filter(u => u.id !== currentUserId);
      if (search) {
        filtered = filtered.filter(u =>
          u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search)
        );
      }

      const response = filtered.map(({ passwordHash, ...fields }) => fields);
      return res.json(response);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // View specific profile
  app.get('/api/users/:id', authMiddleware, (req, res) => {
    const user = db.data.users.find(u => u.id === req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const { passwordHash, ...userResponse } = user;
    return res.json(userResponse);
  });

  // Update profile
  app.put('/api/users/:id', authMiddleware, (req: any, res) => {
    try {
      const { name, avatar } = req.body;
      if (req.user.id !== req.params.id) {
        return res.status(403).json({ error: 'Forbidden: Cannot edit another user' });
      }

      const user = db.data.users.find(u => u.id === req.user.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (name) user.name = name.trim();
      if (avatar) user.avatar = avatar;

      db.save();

      const { passwordHash, ...userResponse } = user;
      return res.json({ success: true, user: userResponse });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // List user's chats
  app.get('/api/chats', authMiddleware, (req: any, res) => {
    try {
      const currentUserId = req.user.id;
      const userChats = db.data.chats.filter(c => c.members.includes(currentUserId));

      const response = userChats.map(chat => {
        let name = chat.name;
        let avatar = 'https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=150&auto=format&fit=crop&q=60'; // default group avatar

        // If direct message, populate target contact's name and avatar
        if (!chat.isGroup) {
          const targetId = chat.members.find(m => m !== currentUserId) || currentUserId;
          const target = db.data.users.find(u => u.id === targetId);
          if (target) {
            name = target.name;
            avatar = target.avatar;
          } else {
            name = 'Unknown Contact';
          }
        }

        const messages = db.data.messages.filter(m => m.chatId === chat.id);
        const lastMessage = messages[messages.length - 1] || null;

        const unreadCount = messages.filter(
          m => m.senderId !== currentUserId && !m.seenBy.includes(currentUserId)
        ).length;

        // Populate member profiles
        const memberObjs = chat.members
          .map(memberId => {
            const u = db.data.users.find(usr => usr.id === memberId);
            if (u) {
              const { passwordHash, ...rest } = u;
              return rest;
            }
            return null;
          })
          .filter(Boolean);

        return {
          id: chat.id,
          isGroup: chat.isGroup,
          name,
          avatar,
          members: memberObjs,
          admins: chat.admins,
          lastMessage,
          unreadCount,
          updatedAt: chat.updatedAt,
        };
      });

      // Sort chats by updatedAt (most recent first)
      response.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      return res.json(response);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Create or get one-to-one chat
  app.post('/api/chats', authMiddleware, (req: any, res) => {
    try {
      const { userId: targetUserId } = req.body;
      if (!targetUserId) {
        return res.status(400).json({ error: 'Missing target userId' });
      }

      const currentUserId = req.user.id;
      const targetUser = db.data.users.find(u => u.id === targetUserId);
      if (!targetUser) {
        return res.status(404).json({ error: 'Target user does not exist' });
      }

      // Check if existing 1:1 chat exists
      let chat = db.data.chats.find(
        c => !c.isGroup && c.members.includes(currentUserId) && c.members.includes(targetUserId)
      );

      if (!chat) {
        chat = {
          id: crypto.randomUUID(),
          isGroup: false,
          members: [currentUserId, targetUserId],
          admins: [currentUserId],
          updatedAt: new Date().toISOString(),
        };
        db.data.chats.push(chat);
        db.save();

        // Notify matching sockets about the new chat channel
        const currentSocketId = onlineUsers.get(currentUserId);
        const targetSocketId = onlineUsers.get(targetUserId);
        if (currentSocketId) {
          io.sockets.sockets.get(currentSocketId)?.join(`chat:${chat.id}`);
        }
        if (targetSocketId) {
          io.sockets.sockets.get(targetSocketId)?.join(`chat:${chat.id}`);
        }
        io.to(`user:${targetUserId}`).emit('chat_created', chat);
      }

      return res.status(201).json(chat);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Get message history for chat
  app.get('/api/chats/:chatId/messages', authMiddleware, (req: any, res) => {
    try {
      const { chatId } = req.params;
      const currentUserId = req.user.id;

      // Verify membership
      const chat = db.data.chats.find(c => c.id === chatId);
      if (!chat || !chat.members.includes(currentUserId)) {
        return res.status(403).json({ error: 'Forbidden: Not a member of this chat' });
      }

      const messages = db.data.messages.filter(m => m.chatId === chatId);

      // Perform read-receipt updates on fetch
      let updatedCount = 0;
      messages.forEach(msg => {
        if (msg.senderId !== currentUserId && !msg.seenBy.includes(currentUserId)) {
          msg.seenBy.push(currentUserId);
          updatedCount++;
        }
      });

      if (updatedCount > 0) {
        db.save();
        // Broadcast read-receipt update to participants
        io.to(`chat:${chatId}`).emit('seen_updated', { chatId, userId: currentUserId });
      }

      return res.json(messages);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Create group chat
  app.post('/api/groups', authMiddleware, (req: any, res) => {
    try {
      const { name, memberIds } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Missing group name' });
      }

      const currentUserId = req.user.id;
      const filteredMembers = Array.from(new Set([currentUserId, ...(memberIds || [])]));

      const chat: Chat = {
        id: crypto.randomUUID(),
        isGroup: true,
        name: name.trim(),
        members: filteredMembers,
        admins: [currentUserId],
        updatedAt: new Date().toISOString(),
      };

      db.data.chats.push(chat);
      db.save();

      // Ensure everyone online joins this room
      filteredMembers.forEach(uid => {
        const sid = onlineUsers.get(uid);
        if (sid) {
          io.sockets.sockets.get(sid)?.join(`chat:${chat.id}`);
        }
        io.to(`user:${uid}`).emit('chat_created', chat);
      });

      return res.status(201).json(chat);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Update group (rename or manage members)
  app.put('/api/groups/:id', authMiddleware, (req: any, res) => {
    try {
      const { id } = req.params;
      const { name, addMember, removeMember } = req.body;
      const currentUserId = req.user.id;

      const chat = db.data.chats.find(c => c.id === id);
      if (!chat || !chat.isGroup) {
        return res.status(404).json({ error: 'Group chat not found' });
      }

      // Check if user is admin for sensitive actions
      const isAdmin = chat.admins.includes(currentUserId);
      if (!chat.members.includes(currentUserId)) {
        return res.status(403).json({ error: 'Forbidden: Not a member' });
      }

      if (name && name.trim()) {
        if (!isAdmin) return res.status(403).json({ error: 'Only admins can rename the group' });
        chat.name = name.trim();
      }

      if (addMember) {
        if (!isAdmin) return res.status(403).json({ error: 'Only admins can add members' });
        if (!chat.members.includes(addMember)) {
          chat.members.push(addMember);
          const socketId = onlineUsers.get(addMember);
          if (socketId) {
            io.sockets.sockets.get(socketId)?.join(`chat:${chat.id}`);
          }
          io.to(`user:${addMember}`).emit('chat_created', chat);
        }
      }

      if (removeMember) {
        if (!isAdmin && removeMember !== currentUserId) {
          return res.status(403).json({ error: 'Only admins can remove members' });
        }
        chat.members = chat.members.filter(m => m !== removeMember);
        chat.admins = chat.admins.filter(a => a !== removeMember);

        const socketId = onlineUsers.get(removeMember);
        if (socketId) {
          io.sockets.sockets.get(socketId)?.leave(`chat:${chat.id}`);
        }
        io.to(`user:${removeMember}`).emit('chat_removed', chat.id);

        if (chat.members.length === 0) {
          db.data.chats = db.data.chats.filter(c => c.id !== chat.id);
        } else if (chat.admins.length === 0) {
          chat.admins.push(chat.members[0]);
        }
      }

      chat.updatedAt = new Date().toISOString();
      db.save();

      io.to(`chat:${chat.id}`).emit('chat_updated', chat);
      return res.json({ success: true, chat });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Media / File upload
  app.post('/api/media/upload', authMiddleware, (req: any, res) => {
    try {
      const { name, mimeType, base64 } = req.body;
      if (!name || !mimeType || !base64) {
        return res.status(400).json({ error: 'Missing name, mimeType or base64 data' });
      }

      const buffer = Buffer.from(base64, 'base64');
      const ext = path.extname(name) || `.${mimeType.split('/')[1] || 'bin'}`;
      const safeFilename = `${crypto.randomUUID()}${ext}`;
      const filePath = path.join(UPLOADS_DIR, safeFilename);

      fs.writeFileSync(filePath, buffer);

      const fileUrl = `/uploads/${safeFilename}`;
      return res.json({ success: true, url: fileUrl });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // ----- SOCKET EVENT HANDLERS -----

  const onlineUsers = new Map<string, string>(); // userId -> socketId

  // Middleware authorization
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Auth error: Token missing'));
    }
    const userId = verifyToken(token);
    if (!userId) {
      return next(new Error('Auth error: Invalid token'));
    }
    socket.data.userId = userId;
    next();
  });

  io.on('connection', socket => {
    const userId = socket.data.userId;
    onlineUsers.set(userId, socket.id);

    console.log(`[Socket] User [${userId}] connected`);

    // Set user online
    const user = db.data.users.find(u => u.id === userId);
    if (user) {
      user.online = true;
      db.save();
      // Broadcast presence
      io.emit('presence_change', { userId, online: true });
    }

    // Personal user room for standalone dashboard notices
    socket.join(`user:${userId}`);

    // Automatically join active chat rooms
    const activeChats = db.data.chats.filter(c => c.members.includes(userId));
    activeChats.forEach(c => {
      socket.join(`chat:${c.id}`);
    });

    // Client actively switching to or visual reading chat
    socket.on('join_chat', chatId => {
      socket.join(`chat:${chatId}`);
    });

    // Client marks a chat as read
    socket.on('mark_seen', ({ chatId }) => {
      const chat = db.data.chats.find(c => c.id === chatId);
      if (chat && chat.members.includes(userId)) {
        let changed = false;
        db.data.messages
          .filter(m => m.chatId === chatId && m.senderId !== userId)
          .forEach(m => {
            if (!m.seenBy.includes(userId)) {
              m.seenBy.push(userId);
              changed = true;
            }
          });
        if (changed) {
          db.save();
          // Emit unread status reset
          io.to(`chat:${chatId}`).emit('seen_updated', { chatId, userId });
        }
      }
    });

    // Messaging handler
    socket.on('send_message', async data => {
      try {
        const { chatId, content, type, mediaUrl, mediaMimeType } = data;
        const senderId = socket.data.userId;

        const chat = db.data.chats.find(c => c.id === chatId);
        if (!chat || !chat.members.includes(senderId)) {
          return socket.emit('error', 'Forbidden: You are not in this chat session');
        }

        const msg: Message = {
          id: crypto.randomUUID(),
          chatId,
          senderId,
          content: content || '',
          type: type || 'text',
          mediaUrl,
          mediaMimeType,
          createdAt: new Date().toISOString(),
          seenBy: [senderId],
        };

        db.data.messages.push(msg);
        chat.lastMessageId = msg.id;
        chat.updatedAt = msg.createdAt;
        db.save();

        // Broadcast original message to all chat participants
        io.to(`chat:${chatId}`).emit('message_received', msg);

        // Notify chat update for unread & sorting
        chat.members.forEach(mId => {
          io.to(`user:${mId}`).emit('chat_sync', { chatId });
        });

        // ----- AI Assistant Support Contact Handler -----
        const hasAISupportPartner = chat.members.includes('ai-bot');
        if (hasAISupportPartner && senderId !== 'ai-bot') {
          // Trigger Motarchats AI Response
          await handleAIResponse(chatId, content || 'Hello');
        }
      } catch (e: any) {
        socket.emit('error', e.message);
      }
    });

    // Typing activity handler
    socket.on('typing', ({ chatId, isTyping }) => {
      socket.to(`chat:${chatId}`).emit('typing_status', { chatId, userId, isTyping });
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] User [${userId}] disconnected`);
      onlineUsers.delete(userId);

      const user = db.data.users.find(u => u.id === userId);
      if (user) {
        user.online = false;
        user.lastSeen = new Date().toISOString();
        db.save();
        io.emit('presence_change', { userId, online: false, lastSeen: user.lastSeen });
      }
    });
  });

  // AI response engine with typing latency logic
  async function handleAIResponse(chatId: string, userMessage: string) {
    if (!genAI) {
      // API fallback notice
      const fallbackMsg: Message = {
        id: crypto.randomUUID(),
        chatId,
        senderId: 'ai-bot',
        content: `I'm Motarchats AI. I would love to chat, but my Gemini API integration is not active yet. Please configure the **GEMINI_API_KEY** secret in Google AI Studio to let us chat live!`,
        type: 'text',
        createdAt: new Date().toISOString(),
        seenBy: [],
      };
      // brief fake typings
      io.to(`chat:${chatId}`).emit('typing_status', { chatId, userId: 'ai-bot', isTyping: true });
      setTimeout(() => {
        io.to(`chat:${chatId}`).emit('typing_status', { chatId, userId: 'ai-bot', isTyping: false });
        db.data.messages.push(fallbackMsg);
        const chat = db.data.chats.find(c => c.id === chatId);
        if (chat) {
          chat.lastMessageId = fallbackMsg.id;
          chat.updatedAt = fallbackMsg.createdAt;
        }
        db.save();
        io.to(`chat:${chatId}`).emit('message_received', fallbackMsg);
        chat?.members.forEach(mId => io.to(`user:${mId}`).emit('chat_sync', { chatId }));
      }, 1000);
      return;
    }

    try {
      // 1. Emit typing indicator
      io.to(`chat:${chatId}`).emit('typing_status', { chatId, userId: 'ai-bot', isTyping: true });

      // Build context from previous messages in this thread
      const currentChatMessages = db.data.messages.filter(m => m.chatId === chatId).slice(-8);
      const conversationHistory = currentChatMessages.map(m => {
        const senderLabel = m.senderId === 'ai-bot' ? 'Motarchats AI' : 'User';
        return `${senderLabel}: ${m.content}`;
      }).join('\n');

      // Fetch AI completion
      const response = await genAI.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: `You are Motarchats AI. Respond naturally to the conversation. Keep it concise, friendly, and under 3-4 short sentences.\n\nConversation history:\n${conversationHistory}\n\nMotarchats AI:`,
        config: {
          systemInstruction:
            'You are Motarchats AI, a helpful virtual assistant support companion inside the quiet luxury messaging app Motarchats. Make answers beautiful, formatting clean, highly supportive, professional, and delightfully brief.',
        },
      });

      const replyText = response.text || 'I checked my systems, but could not produce a response. Let me know if there is anything else I can assist you with!';

      // Add natural artificial latency (e.g. 1.2s delay)
      setTimeout(() => {
        io.to(`chat:${chatId}`).emit('typing_status', { chatId, userId: 'ai-bot', isTyping: false });

        const aiMsg: Message = {
          id: crypto.randomUUID(),
          chatId,
          senderId: 'ai-bot',
          content: replyText,
          type: 'text',
          createdAt: new Date().toISOString(),
          seenBy: [],
        };

        db.data.messages.push(aiMsg);
        const chat = db.data.chats.find(c => c.id === chatId);
        if (chat) {
          chat.lastMessageId = aiMsg.id;
          chat.updatedAt = aiMsg.createdAt;
        }
        db.save();

        io.to(`chat:${chatId}`).emit('message_received', aiMsg);
        chat?.members.forEach(mId => io.to(`user:${mId}`).emit('chat_sync', { chatId }));
      }, 1200);
    } catch (err: any) {
      console.error('Gemini API Error:', err);
      io.to(`chat:${chatId}`).emit('typing_status', { chatId, userId: 'ai-bot', isTyping: false });

      // Send an elegant fallback response to inform the user of temporary service delay
      const offlineMsgText = "I apologize, but I am currently experiencing exceptionally high transmission traffic. Please give me a brief moment to catch my breath, and send your message once more.";
      
      setTimeout(() => {
        const fallbackMsg: Message = {
          id: crypto.randomUUID(),
          chatId,
          senderId: 'ai-bot',
          content: offlineMsgText,
          type: 'text',
          createdAt: new Date().toISOString(),
          seenBy: [],
        };

        db.data.messages.push(fallbackMsg);
        const chat = db.data.chats.find(c => c.id === chatId);
        if (chat) {
          chat.lastMessageId = fallbackMsg.id;
          chat.updatedAt = fallbackMsg.createdAt;
        }
        db.save();

        io.to(`chat:${chatId}`).emit('message_received', fallbackMsg);
        chat?.members.forEach(mId => io.to(`user:${mId}`).emit('chat_sync', { chatId }));
      }, 1000);
    }
  }

  // Serve static UI React app
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve production static builds
    const distPath = path.resolve('dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Listen
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Motarchats is running on http://0.0.0.0:${PORT}`);
  });
}

start().catch(err => {
  console.error('[FAILED START]', err);
});
