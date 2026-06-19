import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  MessageSquare,
  Users,
  User,
  LogOut,
  Search,
  Plus,
  Send,
  Paperclip,
  Check,
  CheckCheck,
  Circle,
  X,
  FileText,
  Image as ImageIcon,
  Video,
  Info,
  ChevronLeft,
  Settings,
  Shield,
  Activity,
  UserPlus,
  UserMinus,
  Sparkles,
} from 'lucide-react';

// ----- CLIENT TYPINGS -----
interface UserProfile {
  id: string;
  name: string;
  email: string;
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
  seenBy: string[];
}

interface Chat {
  id: string;
  isGroup: boolean;
  name: string;
  avatar: string;
  members: UserProfile[];
  admins: string[];
  lastMessage: Message | null;
  unreadCount: number;
  updatedAt: string;
}

export default function App() {
  // ----- AUTH STATES -----
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('motarchats_token'));
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Forms
  const [isRegister, setIsRegister] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authAvatar, setAuthAvatar] = useState('');

  // ----- MAIN APP STATES -----
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');

  // Navigation Panel Drawers
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isNewGroupOpen, setIsNewGroupOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isGroupDetailOpen, setIsGroupDetailOpen] = useState(false);

  // Contacts directory search
  const [usersSearchQuery, setUsersSearchQuery] = useState('');
  const [directoryUsers, setDirectoryUsers] = useState<UserProfile[]>([]);

  // Create Group Form
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  // Edits Profile Form
  const [editName, setEditName] = useState('');
  const [editAvatar, setEditAvatar] = useState('');

  // Group Detail management panel
  const [groupAddUserId, setGroupAddUserId] = useState('');

  // Presence / Ephemerals
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});
  const [typingUsers, setTypingUsers] = useState<Record<string, Record<string, boolean>>>({});

  // Media / Attachment upload structures
  interface UploadPreview {
    name: string;
    mimeType: string;
    base64: string;
    preview: string | null;
    size: string;
  }
  const [uploadingFile, setUploadingFile] = useState<UploadPreview | null>(null);
  const [isUploaderLoading, setIsUploaderLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Mobile navigation visual swap
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  // Refs
  const socketRef = useRef<Socket | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Dynamic API references
  const API_URL = window.location.origin;

  // ----- AUTH FLOW FUNCTIONS -----
  useEffect(() => {
    if (token) {
      localStorage.setItem('motarchats_token', token);
      fetchProfile();
    } else {
      localStorage.removeItem('motarchats_token');
      setCurrentUser(null);
    }
  }, [token]);

  const fetchProfile = async () => {
    try {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setCurrentUser(data.user);
        setEditName(data.user.name);
        setEditAvatar(data.user.avatar);
      } else {
        logout();
      }
    } catch {
      logout();
    }
  };

  const logout = () => {
    setToken(null);
    setCurrentUser(null);
    setChats([]);
    setActiveChatId(null);
    setMessages([]);
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const endpoint = isRegister ? '/api/auth/register' : '/api/api/auth/login'; // fallback check or correct Endpoint
    const cleanEndpoint = isRegister ? '/api/auth/register' : '/api/auth/login';

    try {
      const body = isRegister
        ? { name: authName, email: authEmail, password: authPassword, avatar: authAvatar }
        : { email: authEmail, password: authPassword };

      const response = await fetch(`${API_URL}${cleanEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setToken(data.token);
        // Reset forms
        setAuthEmail('');
        setAuthPassword('');
        setAuthName('');
        setAuthAvatar('');
      } else {
        setAuthError(data.error || 'Authentication failed. Please check inputs.');
      }
    } catch {
      setAuthError('Connection failed. Please verify that server is running.');
    }
  };

  const handleQuickLogin = (email: string) => {
    setAuthEmail(email);
    setAuthPassword('12345678');
    setIsRegister(false);
  };

  // ----- SOCKET INTEGRATION -----
  useEffect(() => {
    if (!token || !currentUser) return;

    // Connect socket
    const socket = io(API_URL, {
      auth: { token },
      autoConnect: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Socket.IO Connected to port 3000');
    });

    socket.on('message_received', (msg: Message) => {
      // Append if active
      if (msg.chatId === activeChatId) {
        setMessages(prev => {
          // Prevent duplicates
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        // Set seen immediately if reading
        socket.emit('mark_seen', { chatId: activeChatId });
      }

      // Sync chats data list
      refreshChats();
    });

    socket.on('seen_updated', ({ chatId, userId }) => {
      if (chatId === activeChatId) {
        setMessages(prev =>
          prev.map(m => {
            if (m.senderId !== userId && !m.seenBy.includes(userId)) {
              return { ...m, seenBy: [...m.seenBy, userId] };
            }
            return m;
          })
        );
      }
      refreshChats();
    });

    socket.on('typing_status', ({ chatId, userId, isTyping }) => {
      setTypingUsers(prev => {
        const chatStatus = prev[chatId] || {};
        return {
          ...prev,
          [chatId]: {
            ...chatStatus,
            [userId]: isTyping,
          },
        };
      });
    });

    socket.on('presence_change', ({ userId, online, lastSeen }) => {
      setOnlineUsers(prev => ({ ...prev, [userId]: online }));
      setChats(prev =>
        prev.map(c => {
          if (!c.isGroup && c.members.some(m => m.id === userId)) {
            return {
              ...c,
              members: c.members.map(m => (m.id === userId ? { ...m, online, lastSeen } : m)),
            };
          }
          return c;
        })
      );
    });

    socket.on('chat_sync', () => {
      refreshChats();
    });

    socket.on('chat_created', () => {
      refreshChats();
    });

    socket.on('chat_removed', removedId => {
      if (activeChatId === removedId) {
        setActiveChatId(null);
        setMessages([]);
        setMobileView('list');
      }
      refreshChats();
    });

    // Load list
    refreshChats();

    return () => {
      socket.disconnect();
    };
  }, [token, currentUser, activeChatId]);

  // Read status emitter on changing chat
  useEffect(() => {
    if (activeChatId && socketRef.current) {
      // Mark read
      socketRef.current.emit('mark_seen', { chatId: activeChatId });
      socketRef.current.emit('join_chat', activeChatId);
      // Fetch messages history
      fetchMessages(activeChatId);
    }
  }, [activeChatId]);

  // Scroll to bottom on updates
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const refreshChats = async () => {
    try {
      const response = await fetch(`${API_URL}/api/chats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setChats(data);
      }
    } catch (e) {
      console.error('Error refreshing chats:', e);
    }
  };

  const fetchMessages = async (chatId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/chats/${chatId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setMessages(data);
      }
    } catch (e) {
      console.error('Error fetching messages:', e);
    }
  };

  const handleSendMessage = () => {
    if ((!messageInput.trim() && !uploadingFile) || !activeChatId || !socketRef.current) return;

    if (uploadingFile) {
      // Send uploading sequence
      sendMediaMessage();
    } else {
      // Text message packet
      socketRef.current.emit('send_message', {
        chatId: activeChatId,
        content: messageInput,
        type: 'text',
      });
      setMessageInput('');
      // Reset typing indicator immediately
      socketRef.current.emit('typing', { chatId: activeChatId, isTyping: false });
    }
  };

  // Typing indicator emission handler
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageInput(e.target.value);

    if (socketRef.current && activeChatId) {
      socketRef.current.emit('typing', { chatId: activeChatId, isTyping: true });

      // Debounce trigger stop typing
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        if (socketRef.current && activeChatId) {
          socketRef.current.emit('typing', { chatId: activeChatId, isTyping: false });
        }
      }, 2000);
    }
  };

  // ----- MEDIA HANDLERS -----
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      alert('Limit Error: Media attachment files cannot exceed 10MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const resultStr = reader.result as string;
      const base64Content = resultStr.split(',')[1];
      setUploadingFile({
        name: file.name,
        mimeType: file.type,
        base64: base64Content,
        preview: file.type.startsWith('image/') ? resultStr : null,
        size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
      });
    };
    reader.readAsDataURL(file);
  };

  const sendMediaMessage = async () => {
    if (!uploadingFile || !activeChatId || !socketRef.current) return;
    setIsUploaderLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/media/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: uploadingFile.name,
          mimeType: uploadingFile.mimeType,
          base64: uploadingFile.base64,
        }),
      });

      const uploadResult = await response.json();
      if (response.ok && uploadResult.url) {
        let type: 'image' | 'video' | 'file' = 'file';
        if (uploadingFile.mimeType.startsWith('image/')) type = 'image';
        else if (uploadingFile.mimeType.startsWith('video/')) type = 'video';

        socketRef.current.emit('send_message', {
          chatId: activeChatId,
          content: messageInput.trim() || uploadingFile.name,
          type,
          mediaUrl: uploadResult.url,
          mediaMimeType: uploadingFile.mimeType,
        });

        // Clear
        setUploadingFile(null);
        setMessageInput('');
      } else {
        alert('Upload Failed: Server could not process attachment.');
      }
    } catch {
      alert('Upload Error: Network failure upload.');
    } finally {
      setIsUploaderLoading(false);
    }
  };

  // Drag and Drop implementation
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // ----- CONTACT FINDER & CHAT LAUNCHER -----
  const searchUsers = async (query: string) => {
    setUsersSearchQuery(query);
    try {
      const response = await fetch(`${API_URL}/api/users?search=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const users = await response.json();
        setDirectoryUsers(users);
      }
    } catch (e) {
      console.error('Error fetching directory:', e);
    }
  };

  const startDirectChat = async (targetUserId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/chats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: targetUserId }),
      });

      if (response.ok) {
        const chat = await response.json();
        await refreshChats();
        setActiveChatId(chat.id);
        setIsNewChatOpen(false);
        setMobileView('chat');
      }
    } catch (e) {
      console.error('Failed to create direct chat:', e);
    }
  };

  // ----- GROUP BUILDER -----
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    try {
      const response = await fetch(`${API_URL}/api/groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: groupName,
          memberIds: selectedMembers,
        }),
      });

      if (response.ok) {
        const newGroup = await response.json();
        await refreshChats();
        setActiveChatId(newGroup.id);
        setGroupName('');
        setSelectedMembers([]);
        setIsNewGroupOpen(false);
        setMobileView('chat');
      }
    } catch (e) {
      console.error('Error creating group:', e);
    }
  };

  const toggleGroupMember = (userId: string) => {
    setSelectedMembers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  // ----- PROFILE EDITING -----
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    try {
      const response = await fetch(`${API_URL}/api/users/${currentUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editName,
          avatar: editAvatar,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentUser(data.user);
        setIsProfileOpen(false);
        refreshChats();
      }
    } catch (e) {
      console.error('Failed to update profile:', e);
    }
  };

  // ----- GROUP MANAGEMENT -----
  const handleAddMemberToGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupAddUserId || !activeChatId) return;

    try {
      const response = await fetch(`${API_URL}/api/groups/${activeChatId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ addMember: groupAddUserId }),
      });

      if (response.ok) {
        setGroupAddUserId('');
        refreshChats();
        fetchMessages(activeChatId);
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to add member. Check permissions.');
      }
    } catch (e) {
      console.error('Failed to add member:', e);
    }
  };

  const handleRemoveMemberFromGroup = async (memberId: string) => {
    if (!activeChatId) return;

    try {
      const response = await fetch(`${API_URL}/api/groups/${activeChatId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ removeMember: memberId }),
      });

      if (response.ok) {
        refreshChats();
        fetchMessages(activeChatId);
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to remove member.');
      }
    } catch (e) {
      console.error('Error removing member:', e);
    }
  };

  // ----- SUB COMPONENT RE-RENDERS -----
  const activeChat = chats.find(c => c.id === activeChatId) || null;

  // Compute typing names
  const renderTypingText = (chatId: string) => {
    const chatTypings = typingUsers[chatId];
    if (!chatTypings) return null;
    const typingIds = Object.keys(chatTypings).filter(uid => chatTypings[uid] && uid !== currentUser?.id);
    if (typingIds.length === 0) return null;

    if (typingIds.length === 1) {
      const finder = dbUsersList().find(u => u.id === typingIds[0]);
      const name = finder ? finder.name.split(' ')[0] : 'Someone';
      return `${name} is typing...`;
    }
    return 'Multiple users are typing...';
  };

  // Map dummy users catalog for displaying names
  const dbUsersList = () => {
    const list: { id: string; name: string }[] = [
      { id: 'ai-bot', name: 'Motarchats AI' },
      { id: 'user-sophia', name: 'Sophia Gold' },
      { id: 'user-marcus', name: 'Marcus Teal' },
      { id: 'user-yara', name: 'Yara Smith' },
    ];
    chats.forEach(c => c.members.forEach(m => {
      if (!list.some(l => l.id === m.id)) list.push({ id: m.id, name: m.name });
    }));
    if (currentUser) list.push({ id: currentUser.id, name: currentUser.name });
    return list;
  };

  // Helper date divider function
  const formatDateGroup = (isoString: string) => {
    const date = new Date(isoString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    }
  };

  // ----- VIEW CONDITIONAL RENDERS -----
  if (!token || !currentUser) {
    return (
      <div id="auth-screen" className="min-h-screen w-screen flex flex-col md:flex-row bg-[#0f0f11] text-zinc-100 font-sans items-stretch">
        
        {/* Marketing Luxury Left Side */}
        <div className="flex-1 hidden md:flex flex-col justify-between p-12 bg-gradient-to-b from-[#161619] to-[#0a0a0c] border-r border-zinc-900 overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right_of_center,rgba(212,175,55,0.06),transparent_45%)]" />
          <div className="z-10">
            <div className="flex items-center gap-3">
              <img src="/assets/logo.png" className="w-10 h-10 rounded-xl object-cover border border-[#d4af37]/20" alt="Motarchats logo" referrerPolicy="no-referrer" />
              <span className="text-xl font-medium tracking-tight bg-gradient-to-r from-amber-200 via-[#d4af37] to-amber-100 bg-clip-text text-transparent">Motarchats</span>
            </div>
          </div>

          <div className="space-y-4 z-10 max-w-md">
            <span className="text-[#d4af37] font-semibold text-xs tracking-wider uppercase">Quiet Luxury Communication</span>
            <h1 className="text-4xl lg:text-5xl font-light leading-none tracking-tight">The ultimate chat ecosystem.</h1>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Experience zero-latency messaging, pristine secure document sharing, and an intelligent virtual AI companion designed to keep you connected in complete solace.
            </p>
          </div>

          <div className="flex gap-8 text-xs text-zinc-500 z-10">
            <span>&copy; 2026 Motarchats Corp.</span>
            <span>Zero Slop Guarantee</span>
          </div>
        </div>

        {/* Login / Register Right Side Form */}
        <div className="w-full md:w-[480px] flex flex-col justify-center p-6 sm:p-12 bg-[#0c0c0e] relative">
          <div className="z-10">
            <div className="md:hidden flex items-center gap-3 mb-8 justify-center">
              <img src="/assets/logo.png" className="w-8 h-8 rounded-lg object-cover" alt="Motarchats" referrerPolicy="no-referrer" />
              <span className="text-lg font-medium tracking-wide text-zinc-200">Motarchats</span>
            </div>

            <div className="mb-6">
              <h2 className="text-2xl font-light text-zinc-50 tracking-tight">
                {isRegister ? 'Begin Your Journey' : 'Welcome Back'}
              </h2>
              <p className="text-zinc-400 text-xs mt-1">
                {isRegister ? 'Join the quiet luxury of Motarchats today.' : 'Please sign in to access your dashboard.'}
              </p>
            </div>

            {authError && (
              <div className="mb-4 p-3 bg-red-950/40 border border-red-900/50 text-red-400 rounded-lg text-xs leading-relaxed">
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {isRegister && (
                <div>
                  <label className="block text-zinc-400 text-xs mb-1 font-medium">Desired Username</label>
                  <input
                    type="text"
                    required
                    maxLength={32}
                    value={authName}
                    onChange={e => setAuthName(e.target.value)}
                    placeholder="e.g. John Doe, Sarah"
                    className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#d4af37] transition-all"
                  />
                </div>
              )}

              <div>
                <label className="block text-zinc-400 text-xs mb-1 font-medium">Email Address</label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={e => setAuthEmail(e.target.value)}
                  placeholder="name@domain.com"
                  className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#d4af37] transition-all"
                />
              </div>

              <div>
                <label className="block text-zinc-400 text-xs mb-1 font-medium">Secure Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={authPassword}
                  onChange={e => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-[#d4af37] transition-all"
                />
              </div>

              {isRegister && (
                <div>
                  <label className="block text-zinc-400 text-xs mb-1 font-medium">Avatar URL (Optional)</label>
                  <input
                    type="url"
                    value={authAvatar}
                    onChange={e => setAuthAvatar(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#d4af37] transition-all"
                  />
                </div>
              )}

              <button
                type="submit"
                className="w-full mt-2 py-2 px-4 bg-[#d4af37] hover:bg-amber-500 font-medium text-sm text-[#0c0c0e] rounded-lg transition-colors cursor-pointer"
              >
                {isRegister ? 'Create Secure Account' : 'Authenticate Credentials'}
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                onClick={() => {
                  setAuthError(null);
                  setIsRegister(!isRegister);
                }}
                className="text-xs text-amber-500 hover:underline font-medium bg-transparent border-none cursor-pointer"
              >
                {isRegister ? 'Already have an account? Sign in' : "Don't have an account yet? Register here"}
              </button>
            </div>

            {/* QUICK LOGINS IN LOGIN DRAWER CARD */}
            <div className="mt-8 pt-6 border-t border-zinc-900">
              <p className="text-zinc-500 text-xxs font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5 justify-center md:justify-start">
                <Shield size={10} className="text-[#d4af37]" /> Demo Sandboxed Channels
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  onClick={() => handleQuickLogin('sophia@example.com')}
                  className="p-2 text-left bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-800/80 hover:border-amber-500/50 rounded-lg transition-all group flex flex-col justify-start cursor-pointer"
                >
                  <span className="text-zinc-300 text-xxs block font-medium group-hover:text-[#d4af37]">Sophia (Design)</span>
                  <span className="text-zinc-600 text-[10px] mt-0.5">Quick Select</span>
                </button>
                <button
                  onClick={() => handleQuickLogin('marcus@example.com')}
                  className="p-2 text-left bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-800/80 hover:border-amber-500/50 rounded-lg transition-all group flex flex-col justify-start cursor-pointer"
                >
                  <span className="text-zinc-300 text-xxs block font-medium group-hover:text-[#d4af37]">Marcus (Lead Eng)</span>
                  <span className="text-zinc-600 text-[10px] mt-0.5">Quick Select</span>
                </button>
                <button
                  onClick={() => handleQuickLogin('yara@example.com')}
                  className="p-2 text-left bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-800/80 hover:border-amber-500/50 rounded-lg transition-all group flex flex-col justify-start cursor-pointer"
                >
                  <span className="text-zinc-300 text-xxs block font-medium group-hover:text-[#d4af37]">Yara (QA Lead)</span>
                  <span className="text-zinc-600 text-[10px] mt-0.5">Quick Select</span>
                </button>
              </div>
              <p className="text-center font-serif italic text-zinc-600 text-[10px] mt-3">
                * Password is <strong>12345678</strong>. Start multiple sessions to converse in real-time.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      id="main-app"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="h-screen w-screen flex bg-[#0d0d0f] text-zinc-200 overflow-hidden font-sans relative"
    >
      {/* File Drop Drag Overlay Window */}
      {isDragOver && (
        <div className="absolute inset-0 bg-[#0f0f11]/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center border-3 border-dashed border-[#d4af37] m-4 rounded-2xl transition-all">
          <div className="bg-zinc-900/80 p-6 rounded-3xl border border-[#d4af37]/20 flex flex-col items-center text-center max-w-sm gap-3">
            <div className="animate-bounce bg-[#d4af37]/10 p-4 rounded-2xl text-[#d4af37]">
              <Paperclip size={32} />
            </div>
            <h3 className="text-[#d4af37] font-medium text-lg">Drop media file to attach</h3>
            <p className="text-zinc-400 text-xs">
              Motarchats processes images, videos, PDFs, and ZIP documents up to 10MB instantly.
            </p>
          </div>
        </div>
      )}

      {/* ==============================================
         LEFT SIDEBAR: CHATS DIRECTORY, CHAT CARDS
         ============================================== */}
      <aside
        id="sidebar-chats"
        className={`w-full md:w-[380px] lg:w-[420px] shrink-0 flex flex-col border-r border-[#1a1a1f] bg-[#111113] h-full ${
          mobileView === 'chat' ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* User Sidebar Header Profile */}
        <div className="p-4 bg-[#141417] border-b border-[#1c1c22] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                className="w-10 h-10 rounded-full border border-[#d4af37]/30 bg-zinc-800 object-cover"
              />
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#111113]" />
            </div>
            <div className="max-w-[150px] lg:max-w-[180px]">
              <h3 className="font-medium text-sm text-zinc-100 truncate leading-snug">{currentUser.name}</h3>
              <span className="text-[10px] text-zinc-500 font-serif italic block">Creator Profile</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setEditName(currentUser.name);
                setEditAvatar(currentUser.avatar);
                setIsProfileOpen(true);
              }}
              title="Edit Profile"
              className="p-2 hover:bg-zinc-800/80 rounded-lg text-zinc-400 hover:text-[#d4af37] transition-all cursor-pointer"
            >
              <Settings size={18} />
            </button>
            <button
              onClick={() => {
                setGroupName('');
                setSelectedMembers([]);
                searchUsers('');
                setIsNewGroupOpen(true);
              }}
              title="Create Group Chat"
              className="p-2 hover:bg-zinc-800/80 rounded-lg text-zinc-400 hover:text-[#d4af37] transition-all cursor-pointer"
            >
              <Users size={18} />
            </button>
            <button
              onClick={() => {
                searchUsers('');
                setIsNewChatOpen(true);
              }}
              title="New Chat Session"
              className="p-2 hover:bg-zinc-800/80 rounded-lg text-zinc-400 hover:text-[#d4af37] transition-all cursor-pointer"
            >
              <MessageSquare size={18} />
            </button>
            <button
              onClick={logout}
              title="Log Out Session"
              className="p-2 hover:bg-red-950/20 rounded-lg text-zinc-400 hover:text-red-400 transition-all cursor-pointer"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {/* Sidebar Active Chats search engine */}
        <div className="p-3 bg-[#111113] border-b border-[#15151a]">
          <div className="flex items-center bg-[#151519] border border-zinc-800 rounded-xl px-3 py-1.5 gap-2 text-zinc-500 focus-within:border-zinc-700 transition-all">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search conversations..."
              className="bg-transparent border-hidden outline-hidden text-xs text-zinc-200 placeholder-zinc-600 w-full"
            />
          </div>
        </div>

        {/* Active Chats scroll listing */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#17171d]/60">
          {chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center h-full gap-2">
              <div className="bg-[#d4af37]/5 p-3 rounded-2xl text-[#d4af37]/30 border border-[#d4af37]/10">
                <MessageSquare size={24} />
              </div>
              <h4 className="text-zinc-400 font-medium text-xs">No active chats yet</h4>
              <p className="text-zinc-600 text-[10px] max-w-[180px]">
                Click the message icon above to search for registered users and start conversing.
              </p>
            </div>
          ) : (
            chats.map(chat => {
              const isSelected = activeChatId === chat.id;
              const typingMsg = renderTypingText(chat.id);
              const lastMsg = chat.lastMessage;

              // Render snippet text nicely mapping to file types
              let messageSnippet = <span className="text-zinc-500">No message history yet</span>;
              if (lastMsg) {
                if (lastMsg.type === 'image') {
                  messageSnippet = (
                    <span className="flex items-center gap-1 text-zinc-400">
                      <ImageIcon size={12} className="text-[#d4af37]" /> Image file
                    </span>
                  );
                } else if (lastMsg.type === 'video') {
                  messageSnippet = (
                    <span className="flex items-center gap-1 text-zinc-400">
                      <Video size={12} className="text-[#d4af37]" /> Video file
                    </span>
                  );
                } else if (lastMsg.type === 'file') {
                  messageSnippet = (
                    <span className="flex items-center gap-1 text-zinc-400 text-xxs truncate">
                      <FileText size={12} className="text-zinc-500" /> {lastMsg.content}
                    </span>
                  );
                } else {
                  messageSnippet = <span className="text-zinc-400 truncate block">{lastMsg.content}</span>;
                }
              }

              // Direct target detail calculations
              const directUser = !chat.isGroup
                ? chat.members.find(m => m.id !== currentUser.id)
                : null;
              const onlineStatus = directUser ? onlineUsers[directUser.id] ?? directUser.online : false;

              return (
                <div
                  key={chat.id}
                  onClick={() => {
                    setActiveChatId(chat.id);
                    setMobileView('chat');
                  }}
                  className={`flex items-center gap-3 p-4 select-none hover:bg-[#18181c] transition-all cursor-pointer ${
                    isSelected ? 'bg-[#151518] border-l-2 border-[#d4af37]' : ''
                  }`}
                >
                  <div className="relative shrink-0">
                    <img
                      src={chat.avatar}
                      alt={chat.name}
                      className="w-11 h-11 rounded-full bg-zinc-800 object-cover border border-zinc-800"
                    />
                    {/* Only direct target displays active presence DOT */}
                    {!chat.isGroup && onlineStatus && (
                      <span className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-emerald-500 border-2 border-[#111113] rounded-full animate-pulse" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <h4 className="font-medium text-xs text-zinc-100 truncate w-[75%]">{chat.name}</h4>
                      {lastMsg && (
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {new Date(lastMsg.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="text-xs w-[85%] min-h-[16px]">
                        {typingMsg ? (
                          <span className="text-[#0abdc6] text-xxs block font-medium animate-pulse">
                            {typingMsg}
                          </span>
                        ) : (
                          messageSnippet
                        )}
                      </div>

                      {/* Unread metallic badge or double check sent statuses */}
                      {chat.unreadCount > 0 ? (
                        <span className="self-center flex items-center justify-center shrink-0 min-w-[18px] h-[18px] bg-[#d4af37] text-[#0d0d0f] font-semibold font-mono text-[9px] rounded-full px-1 shadow-sm">
                          {chat.unreadCount}
                        </span>
                      ) : lastMsg && lastMsg.senderId === currentUser.id ? (
                        <span className="text-zinc-500">
                          {lastMsg.seenBy.length > 1 ? (
                            <CheckCheck size={14} className="text-[#0abdc6]" />
                          ) : (
                            <Check size={14} className="text-zinc-500" />
                          )}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* ==============================================
         RIGHT BLOCK: MAIN CHAT BOARD AREA
         ============================================== */}
      <section
        className={`flex-1 flex flex-col bg-[#141416] h-full ${
          mobileView === 'list' ? 'hidden md:flex' : 'flex'
        }`}
      >
        {activeChat ? (
          <div className="flex flex-col h-full relative">
            
            {/* Active chat pane head profile bar */}
            <div className="p-3 bg-[#131417] border-b border-[#1b1c20] flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setMobileView('list')}
                  className="md:hidden p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer mr-0.5"
                >
                  <ChevronLeft size={18} />
                </button>

                <div className="relative">
                  <img
                    src={activeChat.avatar}
                    alt={activeChat.name}
                    className="w-10 h-10 rounded-full object-cover border border-zinc-800"
                  />
                  {!activeChat.isGroup &&
                    (onlineUsers[activeChat.members.find(m => m.id !== currentUser.id)?.id || ''] ??
                      activeChat.members.find(m => m.id !== currentUser.id)?.online) && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-[#131417] rounded-full" />
                    )}
                </div>

                <div className="min-w-0">
                  <h3 className="font-medium text-xs text-zinc-100 truncate leading-snug">{activeChat.name}</h3>
                  <div className="text-[10px] text-zinc-400">
                    {renderTypingText(activeChat.id) ? (
                      <span className="text-[#0abdc6] font-medium animate-pulse">Typing...</span>
                    ) : activeChat.isGroup ? (
                      <span>{activeChat.members.length} members in session</span>
                    ) : (
                      <span>
                        {(onlineUsers[activeChat.members.find(m => m.id !== currentUser.id)?.id || ''] ??
                        activeChat.members.find(m => m.id !== currentUser.id)?.online)
                          ? 'Online'
                          : 'Offline'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {activeChat.isGroup && (
                  <button
                    onClick={() => setIsGroupDetailOpen(true)}
                    title="Group Settings & Members"
                    className="p-2 hover:bg-zinc-800/80 rounded-lg text-zinc-400 hover:text-[#d4af37] transition-all cursor-pointer"
                  >
                    <Info size={18} />
                  </button>
                )}
              </div>
            </div>

            {/* MESSAGE HISTORY SCROLLBOARD CONTAINER */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-1 opacity-40 select-none">
                  <MessageSquare size={36} className="text-zinc-600 mb-1" />
                  <span className="text-xs font-serif italic text-zinc-400">No communication recorded.</span>
                  <span className="text-[10px] text-zinc-500 max-w-[200px]">Send a hello message to launch real-time updates!</span>
                </div>
              ) : (
                (() => {
                  let lastDate = '';
                  return messages.map((msg, index) => {
                    const isOwn = msg.senderId === currentUser.id;
                    const dateHeader = formatDateGroup(msg.createdAt);
                    const showDateHeader = dateHeader !== lastDate;
                    if (showDateHeader) {
                      lastDate = dateHeader;
                    }

                    // Sender profile details
                    const senderProfile = activeChat.members.find(m => m.id === msg.senderId);
                    const senderName = msg.senderId === 'ai-bot'
                      ? 'Motarchats AI'
                      : senderProfile
                      ? senderProfile.name
                      : 'Member';

                    return (
                      <React.Fragment key={msg.id}>
                        {showDateHeader && (
                          <div className="flex justify-center my-4">
                            <span className="px-3 py-1 text-[10px] text-zinc-400 bg-zinc-900/60 rounded-full font-mono uppercase tracking-wide border border-zinc-800/40">
                              {dateHeader}
                            </span>
                          </div>
                        )}

                        <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                          <div className="max-w-[70%] sm:max-w-[60%] flex gap-2 items-start">
                            {/* Member Avatar left in Group chats */}
                            {!isOwn && activeChat.isGroup && (
                              <img
                                src={senderProfile?.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=G'}
                                alt="avatar"
                                className="w-7 h-7 rounded-full object-cover border border-zinc-800 mt-1 shrink-0"
                              />
                            )}

                            <div
                              className={`rounded-2xl p-3 shadow-lg relative ${
                                isOwn
                                  ? 'bg-zinc-800 text-zinc-100 rounded-tr-none border-l border-b border-zinc-700/50'
                                  : 'bg-[#1b1b1e] text-zinc-100 rounded-tl-none border-r border-b border-zinc-800'
                              }`}
                            >
                              {/* Display sender identifier in group conversations */}
                              {!isOwn && activeChat.isGroup && (
                                <span className="block text-[#d4af37] text-xxs font-semibold tracking-wide mb-1">
                                  {senderName}
                                </span>
                              )}

                              {/* CONDITIONAL CONTENT RENDERS */}
                              {msg.type === 'image' && msg.mediaUrl && (
                                <div className="space-y-2">
                                  <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg group border border-zinc-800 bg-[#0f0f11]">
                                    <img
                                      src={msg.mediaUrl}
                                      alt="Attachment preview"
                                      className="max-h-[220px] max-w-full rounded-md object-contain transition-transform group-hover:scale-102"
                                    />
                                  </a>
                                  {msg.content !== msg.mediaUrl && (
                                    <p className="text-xs text-zinc-350 select-text font-serif leading-relaxed">{msg.content}</p>
                                  )}
                                </div>
                              )}

                              {msg.type === 'video' && msg.mediaUrl && (
                                <div className="space-y-2">
                                  <video
                                    src={msg.mediaUrl}
                                    controls
                                    className="max-h-[240px] rounded-lg border border-zinc-800 max-w-full bg-black block"
                                  />
                                  {msg.content !== msg.mediaUrl && (
                                    <p className="text-xs text-zinc-350 select-text leading-relaxed">{msg.content}</p>
                                  )}
                                </div>
                              )}

                              {msg.type === 'file' && msg.mediaUrl && (
                                <a
                                  href={msg.mediaUrl}
                                  download
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-3 p-2.5 bg-zinc-900/80 rounded-xl hover:bg-zinc-950 border border-zinc-800 group transition-colors select-none text-left"
                                >
                                  <div className="bg-[#d4af37]/10 p-2 text-[#d4af37] rounded-lg group-hover:bg-[#d4af37]/20 transition-all">
                                    <FileText size={18} />
                                  </div>
                                  <div className="min-w-0 pr-1">
                                    <span className="block text-xs font-medium text-zinc-200 truncate group-hover:text-amber-300">
                                      {msg.content}
                                    </span>
                                    <span className="text-[9px] block text-zinc-500 font-mono">Attachment Payload</span>
                                  </div>
                                </a>
                              )}

                              {msg.type === 'text' && (
                                <p className="text-xs select-text font-serif leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                              )}

                              {/* Msg Footer Info: Time + Checkmark seen receipts */}
                              <div className="flex items-center justify-end gap-1.5 mt-2 text-zinc-500 text-[9px] font-mono select-none">
                                <span>
                                  {new Date(msg.createdAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: false,
                                  })}
                                </span>
                                {isOwn && (
                                  <span>
                                    {msg.seenBy.length > 1 ? (
                                      <CheckCheck size={12} className="text-[#0abdc6]" />
                                    ) : (
                                      <Check size={12} className="text-zinc-500" />
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  });
                })()
              )}
              <div ref={messageEndRef} />
            </div>

            {/* BOTTOM INPUT CONTROLLER */}
            <div className="p-3 bg-[#111113] border-t border-[#1b1c21] flex flex-col gap-2">
              
              {/* Media Attachment Upload Preview display */}
              {uploadingFile && (
                <div className="p-3 bg-zinc-950 rounded-xl border border-dashed border-[#d4af37]/30 flex items-center justify-between animate-fade-in text-left">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative">
                      {uploadingFile.preview ? (
                        <img
                          src={uploadingFile.preview}
                          alt="preview"
                          className="w-11 h-11 rounded-lg object-cover border border-zinc-800"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[#d4af37]">
                          <FileText size={18} />
                        </div>
                      )}
                      {isUploaderLoading && (
                        <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center">
                          <Activity size={14} className="animate-spin text-[#d4af37]" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <span className="block text-xs font-semibold text-zinc-200 truncate pr-4">
                        {uploadingFile.name}
                      </span>
                      <span className="text-[10px] block text-zinc-500 font-mono mt-0.5">
                        {uploadingFile.size} • Raw data ready
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => setUploadingFile(null)}
                    disabled={isUploaderLoading}
                    className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-full transition-colors cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Central Trigger Row */}
              <div className="flex items-end gap-2">
                <input
                  type="file"
                  id="media-uploader-input"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleFileChange}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach Documents or Media"
                  className="p-2.5 shrink-0 hover:bg-zinc-800/85 rounded-xl border border-zinc-800 text-zinc-400 hover:text-[#d4af37] transition-all cursor-pointer"
                >
                  <Paperclip size={18} />
                </button>

                <div className="flex-1 relative">
                  <textarea
                    rows={1}
                    value={messageInput}
                    onChange={handleInputChange}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder={
                      uploadingFile
                        ? 'Add a caption to the file (Optional)...'
                        : 'Compose message or drop attachments here...'
                    }
                    className="w-full bg-[#151518] border border-zinc-800 focus:border-[#d4af37] outline-hidden text-xs rounded-xl py-2.5 px-3.5 pr-10 resize-none text-zinc-150 placeholder-zinc-650 min-h-[38px] max-h-[120px] transition-all scrollbar-none"
                  />
                </div>

                <button
                  onClick={handleSendMessage}
                  disabled={(!messageInput.trim() && !uploadingFile) || isUploaderLoading}
                  className="p-2.5 shrink-0 bg-[#d4af37] hover:bg-amber-500 disabled:opacity-40 disabled:hover:bg-[#d4af37] text-[#0c0c0e] font-semibold rounded-xl transition-all shadow-sm flex items-center justify-center cursor-pointer"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>

          </div>
        ) : (
          /* NO CHAT SELECTED Lux Default view screen */
          <div className="h-full flex flex-col justify-between p-12 bg-gradient-to-b from-[#141416] to-[#0d0d10] text-center select-none relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left_of_center,rgba(212,175,55,0.04),transparent_55%)]" />
            
            <div className="z-10 text-right opacity-60">
              <span className="font-mono text-[9px] uppercase tracking-widest text-[#d4af37]">STRICTLY SECURE PLATFORM</span>
            </div>

            <div className="flex flex-col items-center justify-center gap-4 z-10">
              <div className="relative">
                <div className="absolute inset-x-0 -top-4 -bottom-4 bg-[#d4af37]/10 blur-xl rounded-full border border-[#d4af37]/15" />
                <div className="relative border-2 border-[#d4af37]/30 bg-[#17171a] p-1 rounded-3xl text-[#d4af37] shadow-xl active:scale-95 transition-transform">
                  <img src="/assets/logo.png" className="w-[84px] h-[84px] rounded-2xl object-cover" alt="Motarchats" referrerPolicy="no-referrer" />
                </div>
              </div>

              <div className="space-y-1.5 max-w-sm mt-2">
                <h2 className="text-2xl font-light tracking-tight text-zinc-100 font-serif">Welcome to Motarchats</h2>
                <p className="text-zinc-500 text-xs leading-relaxed font-serif">
                  Select an active contact or launch a private group session from the directory to start transmitting zero-latency messages.
                </p>
              </div>

              {/* Quick Launch helper */}
              <div className="flex gap-2.5 mt-2">
                <button
                  onClick={() => {
                    searchUsers('');
                    setIsNewChatOpen(true);
                  }}
                  className="px-4 py-2 bg-zinc-900 border border-zinc-800 hover:border-amber-500/40 text-xs rounded-xl font-medium text-zinc-350 hover:text-zinc-100 transition-colors cursor-pointer"
                >
                  Find Contacts
                </button>
                <button
                  onClick={() => {
                    setGroupName('');
                    setSelectedMembers([]);
                    setIsNewGroupOpen(true);
                  }}
                  className="px-4 py-2 bg-zinc-900 border border-zinc-800 hover:border-amber-500/40 text-xs rounded-xl font-medium text-zinc-350 hover:text-zinc-100 transition-colors cursor-pointer"
                >
                  Launch Group Chat
                </button>
              </div>
            </div>

            <div className="flex justify-center items-center gap-2 text-xxs font-mono text-zinc-650 z-10 tracking-widest uppercase">
              <Shield size={12} className="text-[#d5af37]/40" /> Handshaked encryption active
            </div>
          </div>
        )}
      </section>

      {/* ==============================================
         OVERLAYS & MODALS WINDOWS & SLIDING CONTROLLERS
         ============================================== */}

      {/* MODAL 1: NEW CHAT / FIND REGISTERED CONTACTS */}
      {isNewChatOpen && (
        <div className="absolute inset-0 bg-[#0c0c0e]/85 backdrop-blur-sm z-40 flex items-center justify-center p-4">
          <div className="bg-[#141416] border border-[#23232a] w-full max-w-md rounded-2xl p-5 shadow-2xl relative animate-fade-in text-left">
            <button
              onClick={() => setIsNewChatOpen(false)}
              className="absolute top-4 right-4 p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>

            <div className="mb-4">
              <h3 className="text-lg font-medium text-zinc-100 leading-snug">Launch New Chat Session</h3>
              <p className="text-zinc-500 text-xxs mt-0.5">Explore active profiles inside Motarchats directory.</p>
            </div>

            <div className="mb-4 relative">
              <input
                type="text"
                autoFocus
                value={usersSearchQuery}
                onChange={e => searchUsers(e.target.value)}
                placeholder="Search user name or target email address..."
                className="w-full bg-[#1b1b1e] border border-zinc-800 focus:border-[#d4af37] outline-hidden rounded-xl text-xs py-2 px-3 pl-8 text-zinc-200 placeholder-zinc-600"
              />
              <Search className="absolute left-2.5 top-2.5 text-zinc-600" size={14} />
            </div>

            <div className="max-h-[240px] overflow-y-auto space-y-2 pr-1">
              {/* Default Automated Support partner display if empty search */}
              {!usersSearchQuery && (
                <div
                  onClick={() => startDirectChat('ai-bot')}
                  className="flex items-center justify-between p-2 hover:bg-[#1c1c20] rounded-xl transition-all cursor-pointer border border-[#d4af37]/15 bg-[#d4af37]/5 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=60"
                      alt="ai avatar"
                      className="w-9 h-9 rounded-full object-cover border border-[#d4af37]/20"
                    />
                    <div>
                      <span className="block text-xs font-semibold text-zinc-200 truncate group-hover:text-amber-400">
                        Motarchats AI (Helper Bots)
                      </span>
                      <span className="text-[10px] block text-zinc-500">Instant Automated AI responses</span>
                    </div>
                  </div>
                  <Sparkles size={14} className="text-[#d4af37] shrink-0 mr-1 animate-pulse" />
                </div>
              )}

              {directoryUsers.length === 0 ? (
                /* Static notice on query */
                usersSearchQuery ? (
                  <p className="text-center text-zinc-600 text-xs py-4">No matching registered details found.</p>
                ) : (
                  // Initial display: show fallback profiles immediately
                  dbUsersList()
                    .filter(u => u.id !== currentUser.id && u.id !== 'ai-bot')
                    .map(u => (
                      <div
                        key={u.id}
                        onClick={() => startDirectChat(u.id)}
                        className="flex items-center gap-3 p-2 hover:bg-[#18181c] rounded-xl transition-all cursor-pointer"
                      >
                        <img
                          src={
                            chats.find(c => c.members.some(m => m.id === u.id))?.avatar ||
                            `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(u.name)}`
                          }
                          alt="user"
                          className="w-9 h-9 rounded-full object-cover border border-zinc-850"
                        />
                        <div>
                          <span className="block text-xs font-medium text-zinc-200">{u.name}</span>
                          <span className="text-[10px] block text-zinc-500">Click to compose session</span>
                        </div>
                      </div>
                    ))
                )
              ) : (
                directoryUsers.map(u => (
                  <div
                    key={u.id}
                    onClick={() => startDirectChat(u.id)}
                    className="flex items-center gap-3 p-2 hover:bg-[#18181c] rounded-xl transition-all cursor-pointer"
                  >
                    <img
                      src={u.avatar}
                      alt={u.name}
                      className="w-9 h-9 rounded-full object-cover border border-zinc-850"
                    />
                    <div>
                      <span className="block text-xs font-medium text-zinc-200">{u.name}</span>
                      <span className="text-[9px] block text-zinc-500 font-mono">{u.email}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: NEW GROUP CHAT BUILDER */}
      {isNewGroupOpen && (
        <div className="absolute inset-0 bg-[#0c0c0e]/85 backdrop-blur-sm z-40 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateGroup}
            className="bg-[#141416] border border-[#23232a] w-full max-w-md rounded-2xl p-5 shadow-2xl relative animate-fade-in text-left"
          >
            <button
              type="button"
              onClick={() => setIsNewGroupOpen(false)}
              className="absolute top-4 right-4 p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>

            <div className="mb-4">
              <h3 className="text-lg font-medium text-zinc-100 leading-snug">Build Group Chatroom</h3>
              <p className="text-zinc-500 text-xxs mt-0.5">Invite multiple team members to a coordinated stream.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-zinc-400 text-xs mb-1 font-medium">Group Chat Title</label>
                <input
                  type="text"
                  required
                  maxLength={40}
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  placeholder="e.g. Design Sync, Tech Discussion"
                  className="w-full bg-[#1b1b1e] border border-zinc-800 focus:border-[#d4af37] outline-hidden rounded-xl text-xs py-2 px-3 text-zinc-200 placeholder-zinc-650"
                />
              </div>

              <div>
                <label className="block text-zinc-400 text-xs mb-1.5 font-medium">Select Members</label>
                <div className="max-h-[140px] overflow-y-auto space-y-1.5 border border-zinc-850 rounded-xl p-2 bg-zinc-950">
                  {dbUsersList()
                    .filter(u => u.id !== currentUser.id)
                    .map(user => {
                      const isChecked = selectedMembers.includes(user.id);
                      return (
                        <div
                          key={user.id}
                          onClick={() => toggleGroupMember(user.id)}
                          className={`flex items-center justify-between p-1.5 rounded-lg select-none hover:bg-zinc-900 cursor-pointer ${
                            isChecked ? 'bg-zinc-900/50' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={
                                chats.find(c => c.members.some(m => m.id === user.id))?.avatar ||
                                `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name)}`
                              }
                              alt="user placeholder"
                              className="w-7 h-7 rounded-full object-cover"
                            />
                            <span className="text-zinc-200 text-xxs truncate font-medium">{user.name}</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} // handled by click
                            className="rounded-md accent-[#d4af37]"
                          />
                        </div>
                      );
                    })}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-[#d4af37] hover:bg-amber-500 font-semibold text-xs text-[#0a0a0c] rounded-xl transition-colors cursor-pointer"
              >
                Launch Coordinated Group Chat
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 3: PROFILE SETTINGS */}
      {isProfileOpen && (
        <div className="absolute inset-0 bg-[#0c0c0e]/85 backdrop-blur-sm z-40 flex items-center justify-center p-4">
          <form
            onSubmit={handleUpdateProfile}
            className="bg-[#141416] border border-[#23232a] w-full max-w-sm rounded-2xl p-5 shadow-2xl relative animate-fade-in text-left"
          >
            <button
              type="button"
              onClick={() => setIsProfileOpen(false)}
              className="absolute top-4 right-4 p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>

            <div className="mb-4">
              <h3 className="text-lg font-medium text-zinc-100 leading-snug">Edit Profile</h3>
              <p className="text-zinc-500 text-xxs mt-0.5">Manage how you visually represent yourself in Motarchats.</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-zinc-400 text-xs mb-1 font-medium">Username Display</label>
                <input
                  type="text"
                  required
                  maxLength={32}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full bg-[#1b1b1e] border border-zinc-800 focus:border-[#d4af37] outline-hidden rounded-xl text-xs py-2 px-3 text-zinc-200 placeholder-zinc-650"
                />
              </div>

              <div>
                <label className="block text-zinc-400 text-xs mb-1 font-medium">Profile Image Frame (URL)</label>
                <input
                  type="url"
                  value={editAvatar}
                  onChange={e => setEditAvatar(e.target.value)}
                  placeholder="https://images.unsplash.com/your-image"
                  className="w-full bg-[#1b1b1e] border border-zinc-800 focus:border-[#d4af37] outline-hidden rounded-xl text-xs py-2 px-3 text-zinc-200 placeholder-zinc-650"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-[#d4af37] hover:bg-amber-500 font-semibold text-xs text-[#0a0a0c] rounded-xl transition-colors cursor-pointer"
              >
                Save Profile Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 4: ACTIONS AND GROUP INFO DRAWER */}
      {isGroupDetailOpen && activeChat && activeChat.isGroup && (
        <div className="absolute inset-0 bg-[#0c0c0e]/85 backdrop-blur-sm z-40 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#141416] border border-[#23232a] w-full max-w-sm rounded-2xl p-5 shadow-2xl relative text-left">
            <button
              onClick={() => setIsGroupDetailOpen(false)}
              className="absolute top-4 right-4 p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>

            <div className="mb-4">
              <span className="px-2 py-0.5 text-[8px] tracking-widest font-mono font-semibold uppercase text-[#d4af37] bg-[#d4af37]/10 rounded-full">
                Active Group Board
              </span>
              <h3 className="text-lg font-medium text-zinc-100 leading-snug mt-1.5">{activeChat.name}</h3>
              <p className="text-zinc-500 text-xxs mt-0.5">Manage members, admins, or add participants.</p>
            </div>

            {/* List of members in detail */}
            <div className="space-y-3">
              <div>
                <span className="block text-zinc-400 text-xxs font-medium mb-1.5">Group Members</span>
                <div className="max-h-[150px] overflow-y-auto space-y-1.5 border border-zinc-850 p-2 rounded-xl bg-zinc-950">
                  {activeChat.members.map(member => {
                    const isSelfAdmin = activeChat.admins.includes(currentUser.id);
                    const isMemberAdmin = activeChat.admins.includes(member.id);
                    const isTargetSelf = member.id === currentUser.id;

                    return (
                      <div key={member.id} className="flex items-center justify-between p-1 hover:bg-zinc-900/50 rounded-lg">
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={member.avatar}
                            alt={member.name}
                            className="w-7 h-7 rounded-full object-cover border border-zinc-850"
                          />
                          <div className="min-w-0">
                            <span className="text-zinc-200 text-xxs font-medium block truncate max-w-[150px]">
                              {member.name} {isTargetSelf && '(You)'}
                            </span>
                            {isMemberAdmin && (
                              <span className="text-[8px] text-[#d4af37] font-mono block">GROUP ADMINISTRATOR</span>
                            )}
                          </div>
                        </div>

                        {/* Remove participant utility */}
                        {isSelfAdmin && !isTargetSelf && (
                          <button
                            onClick={() => handleRemoveMemberFromGroup(member.id)}
                            title="Remove Member"
                            className="p-1 hover:bg-red-950/30 text-zinc-500 hover:text-red-400 rounded-md transition-colors cursor-pointer"
                          >
                            <UserMinus size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add member utility if admin */}
              {activeChat.admins.includes(currentUser.id) && (
                <form onSubmit={handleAddMemberToGroup} className="pt-2 border-t border-zinc-850">
                  <span className="block text-zinc-400 text-xxs font-medium mb-1.5">Add Member Participant</span>
                  <div className="flex gap-1.5">
                    <select
                      value={groupAddUserId}
                      onChange={e => setGroupAddUserId(e.target.value)}
                      className="flex-1 bg-[#151517] border border-zinc-800 rounded-xl text-xxs py-1.5 px-2 text-zinc-200 focus:outline-none"
                    >
                      <option value="">Choose contact...</option>
                      {dbUsersList()
                        .filter(u => !activeChat.members.some(m => m.id === u.id))
                        .map(user => (
                          <option key={user.id} value={user.id}>
                            {user.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="submit"
                      disabled={!groupAddUserId}
                      className="px-3 py-1 bg-[#d4af37] text-[#0a0a0c] hover:bg-amber-500 disabled:opacity-40 hover:disabled:bg-[#d4af37] rounded-xl text-xxs font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <UserPlus size={12} /> Invite
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
