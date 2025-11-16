import express from 'express';
import multer from 'multer';
import { body, query, param, validationResult } from 'express-validator';
import { MessageStatus } from '@prisma/client';
import { asyncHandler, createAppError } from '@/middleware/errorHandler';
import { requireMessengerOrAbove, AuthenticatedRequest } from '@/middleware/auth';
import { sanitizeMessageInput } from '@/middleware/sanitization';
import { logger } from '@/services/logger';
import { saveAudioFile, getAudioFile, deleteAudioFile } from '@/services/fileStorage';
import { io } from '@/app';
import prisma from '@/db';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'audioFile') {
      if (file.mimetype.startsWith('audio/')) {
        cb(null, true);
      } else {
        cb(new Error('Only audio files are allowed'));
      }
    } else {
      cb(new Error('Unexpected field'));
    }
  },
});

// Get conversations for current user with pagination
router.get('/conversations', [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  const userId = req.user!.id;
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;

  // Get all messages where user is either sender or receiver (limited for performance)
  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { senderId: userId },
        { receiverId: userId },
      ],
    },
    include: {
      sender: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      },
      receiver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 500, // Limit to recent 500 messages for performance
  });

  // Group messages into conversations
  const conversationsMap = new Map();

  messages.forEach(message => {
    const otherUserId = message.senderId === userId ? message.receiverId : message.senderId;
    const otherUser = message.senderId === userId ? message.receiver : message.sender;
    
    if (!conversationsMap.has(otherUserId)) {
      conversationsMap.set(otherUserId, {
        id: [userId, otherUserId].sort().join("-"),
        participants: [
          {
            id: req.user!.id,
            firstName: req.user!.firstName,
            lastName: req.user!.lastName,
            role: req.user!.role,
          },
          otherUser
        ],
        lastMessage: {
          id: message.id,
          content: message.content,
          type: message.audioPath ? 'VOICE' : 'TEXT',
          timestamp: message.createdAt,
          sender: message.sender,
        },
        unreadCount: 0,
        priority: 'NORMAL', // Will be updated with highest priority
        lastTimestamp: message.createdAt,
        messages: [],
      });
    }
    
    const conversation = conversationsMap.get(otherUserId);
    conversation.messages.push(message);
    
    // Count unread messages (where current user is receiver and message is unread)
    if (message.receiverId === userId && !message.isRead) {
      conversation.unreadCount++;
      // Update priority to highest unread message priority
      const messagePriority = message.priority || 'NORMAL';
      const priorityOrder = { 'URGENT': 4, 'HIGH': 3, 'NORMAL': 2, 'LOW': 1 };
      const currentPriorityOrder = priorityOrder[conversation.priority as keyof typeof priorityOrder] || 2;
      const messagePriorityOrder = priorityOrder[messagePriority as keyof typeof priorityOrder] || 2;
      if (messagePriorityOrder > currentPriorityOrder) {
        conversation.priority = messagePriority;
      }
    }
    
    // Update lastTimestamp if this message is more recent
    if (new Date(message.createdAt) > new Date(conversation.lastTimestamp)) {
      conversation.lastTimestamp = message.createdAt;
    }
  });

  const allConversations = Array.from(conversationsMap.values()).sort((a, b) =>
    new Date(b.lastMessage.timestamp).getTime() - new Date(a.lastMessage.timestamp).getTime()
  );

  // Apply pagination
  const total = allConversations.length;
  const conversations = allConversations.slice(offset, offset + limit);

  res.json({
    success: true,
    data: conversations,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    },
  });
}));

// Get messages for current user
router.get('/', [
  query('type').optional().isIn(['inbox', 'sent', 'all']),
  query('unread').optional().isBoolean(),
  query('conversationId').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { type = 'all', unread, conversationId, limit = 50, offset = 0 } = req.query;
  const userId = req.user!.id;

  let whereClause: any = {};
  
  // Filter by conversationId if provided
  if (conversationId) {
    // Extract the two user IDs from the conversationId (format: "userId1-userId2")
    const userIds = (conversationId as string).split('-').sort();
    whereClause.OR = [
      { senderId: userIds[0], receiverId: userIds[1] },
      { senderId: userIds[1], receiverId: userIds[0] },
    ];
  } else {
    // Otherwise, filter by type
    switch (type) {
      case 'inbox':
        whereClause.receiverId = userId;
        break;
      case 'sent':
        whereClause.senderId = userId;
        break;
      default:
        whereClause.OR = [
          { receiverId: userId },
          { senderId: userId },
        ];
    }
  }

  if (unread === 'true') {
    whereClause.isRead = false;
    whereClause.receiverId = userId; // Only inbox messages can be unread
  }

  const messages = await prisma.message.findMany({
    where: whereClause,
    include: {
      sender: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      },
      receiver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: parseInt(limit as string),
    skip: parseInt(offset as string),
  });

  const totalCount = await prisma.message.count({ where: whereClause });

  // Transform messages to include audioUrl, timestamp, and readBy
  const transformedMessages = messages.map(message => ({
    ...message,
    audioUrl: message.audioPath ? `/api/messages/${message.id}/audio` : undefined,
    timestamp: message.createdAt,
    readBy: message.isRead && message.readAt ? [message.receiverId] : [],
  }));

  res.json({
    success: true,
    data: transformedMessages,
    pagination: {
      total: totalCount,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      hasMore: totalCount > parseInt(offset as string) + parseInt(limit as string),
    },
  });
}));

// Send a new message (supports both text and multipart/audio)
// Apply input sanitization to prevent XSS attacks
router.post('/', upload.single('audioFile'), sanitizeMessageInput, asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { receiverId, conversationId, content, priority = 'NORMAL', type = 'TEXT', duration } = req.body;
  const senderId = req.user!.id;
  const audioFile = req.file;

  // Validate required fields
  if (!receiverId && !conversationId) {
    return res.status(400).json({
      success: false,
      error: 'Either receiverId or conversationId is required',
    });
  }

  if (type === 'VOICE' && !audioFile) {
    return res.status(400).json({
      success: false,
      error: 'Audio file is required for voice messages',
    });
  }

  if (type === 'TEXT' && !content) {
    return res.status(400).json({
      success: false,
      error: 'Content is required for text messages',
    });
  }

  // Determine receiver ID from conversationId if not provided
  let finalReceiverId = receiverId;
  if (conversationId && !receiverId) {
    // Extract receiver ID from conversationId format: "userId1-userId2"
    const participants = conversationId.split('-');
    finalReceiverId = participants.find((id: string) => id !== senderId);
    
    if (!finalReceiverId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid conversationId format',
      });
    }
  }

  // Verify receiver exists
  const receiver = await prisma.user.findUnique({
    where: { id: finalReceiverId },
    select: { id: true, isActive: true },
  });

  if (!receiver || !receiver.isActive) {
    throw createAppError('Receiver not found or inactive', 400);
  }

  // Handle audio file upload
  let audioPath = null;
  let audioDuration = null;
  
  if (audioFile && type === 'VOICE') {
    // Save audio file to storage
    const { path: savedPath } = await saveAudioFile(
      audioFile.buffer,
      `${senderId}_${finalReceiverId}`,
      audioFile.mimetype
    );
    
    audioPath = savedPath;
    audioDuration = duration ? parseInt(duration) : null;
    
    logger.info('Audio file uploaded', {
      filename: audioFile.originalname,
      size: audioFile.size,
      mimetype: audioFile.mimetype,
      storagePath: audioPath,
    });
  }

  const message = await prisma.message.create({
    data: {
      senderId,
      receiverId: finalReceiverId,
      content: type === 'VOICE' ? '[Voice Message]' : content,
      audioPath,
      duration: audioDuration,
      priority,
      status: MessageStatus.SENT,
    },
    include: {
      sender: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      },
      receiver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      },
    },
  });

  // Broadcast message via WebSocket
  const wsMessage = {
    ...message,
    type: type as 'TEXT' | 'VOICE',
    timestamp: message.createdAt,
    audioUrl: audioPath ? `/api/messages/${message.id}/audio` : undefined,
    conversationId: conversationId || [senderId, finalReceiverId].sort().join("-"),
  };

  // Send to receiver
  io.to(`user:${finalReceiverId}`).emit('message:new', {
    type: 'message_received',
    message: wsMessage,
    timestamp: new Date().toISOString(),
  });

  // Send to sender for confirmation
  io.to(`user:${senderId}`).emit('message:sent', {
    type: 'message_sent',
    message: wsMessage,
    timestamp: new Date().toISOString(),
  });

  logger.info(`${type} message sent from ${senderId} to ${finalReceiverId}`, {
    messageId: message.id,
    priority,
    hasAudio: !!audioPath,
  });

  res.status(201).json({
    success: true,
    message: 'Message sent successfully',
    data: wsMessage,
  });
}));

// Serve audio file
router.get('/:id/audio', [
  param('id').isUUID(),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const message = await prisma.message.findUnique({
    where: { id },
    select: {
      id: true,
      audioPath: true,
      senderId: true,
      receiverId: true,
    },
  });

  if (!message) {
    throw createAppError('Message not found', 404);
  }

  if (!message.audioPath) {
    throw createAppError('No audio file associated with this message', 404);
  }

  // Check if user has permission to access this audio
  if (message.senderId !== userId && message.receiverId !== userId) {
    throw createAppError('Not authorized to access this audio file', 403);
  }

  // Get audio file from storage
  const { exists, fullPath } = await getAudioFile(message.audioPath);
  
  if (!exists) {
    throw createAppError('Audio file not found in storage', 404);
  }

  // Determine content type based on file extension
  const ext = message.audioPath.split('.').pop()?.toLowerCase();
  const contentType = ext === 'mp3' ? 'audio/mpeg' :
                     ext === 'wav' ? 'audio/wav' :
                     ext === 'ogg' ? 'audio/ogg' :
                     ext === 'm4a' ? 'audio/mp4' :
                     'audio/webm';

  // Stream the audio file
  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.sendFile(fullPath);
}));

// Upload audio message
router.post('/audio', requireMessengerOrAbove, [
  body('receiverId').isUUID(),
  body('duration').optional().isInt({ min: 1, max: 300 }), // max 5 minutes
  body('priority').optional().isIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { receiverId, duration, priority = 'NORMAL' } = req.body;
  const senderId = req.user!.id;

  // Verify receiver exists
  const receiver = await prisma.user.findUnique({
    where: { id: receiverId },
    select: { id: true, isActive: true },
  });

  if (!receiver || !receiver.isActive) {
    throw createAppError('Receiver not found or inactive', 400);
  }

  // Note: This endpoint expects the audio file to be uploaded via multipart/form-data
  // For now, we'll create a placeholder path, but in real use this should not be used
  // The main POST / endpoint with upload.single('audioFile') should be used instead
  const audioPath = null;

  const message = await prisma.message.create({
    data: {
      senderId,
      receiverId,
      audioPath,
      duration,
      priority,
      status: MessageStatus.SENT,
      content: '[Voice Message]',
    },
    include: {
      sender: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
      receiver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  logger.info(`Audio message sent from ${senderId} to ${receiverId}`, {
    messageId: message.id,
    duration,
    priority,
  });

  res.status(201).json({
    message: 'Audio message sent successfully',
    data: message,
  });
}));

// Mark message as read handler (shared between PATCH and PUT)
const markAsReadHandler = asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const message = await prisma.message.findUnique({
    where: { id },
  });

  if (!message) {
    throw createAppError('Message not found', 404);
  }

  if (message.receiverId !== userId) {
    throw createAppError('Not authorized to mark this message as read', 403);
  }

  const updatedMessage = await prisma.message.update({
    where: { id },
    data: {
      isRead: true,
      readAt: new Date(),
      status: MessageStatus.READ,
    },
  });

  res.json({
    success: true,
    message: 'Message marked as read',
    data: updatedMessage,
  });
});

// Mark message as read - PATCH endpoint (RESTful)
router.patch('/:id/read', [param('id').isUUID()], markAsReadHandler);

// Mark message as read - PUT endpoint (for backward compatibility)
router.put('/:id/read', [param('id').isUUID()], markAsReadHandler);

// Delete message
router.delete('/:id', [
  param('id').isUUID(),
], asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const message = await prisma.message.findUnique({
    where: { id },
  });

  if (!message) {
    throw createAppError('Message not found', 404);
  }

  if (message.senderId !== userId && message.receiverId !== userId) {
    throw createAppError('Not authorized to delete this message', 403);
  }

  // Delete associated audio file if exists
  if (message.audioPath) {
    await deleteAudioFile(message.audioPath);
  }

  await prisma.message.delete({
    where: { id },
  });

  logger.info(`Message deleted: ${id}`, {
    userId,
  });

  res.json({
    message: 'Message deleted successfully',
  });
}));

export default router;