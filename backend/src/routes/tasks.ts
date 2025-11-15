import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { TaskStatus, TaskPriority } from '@prisma/client';
import { asyncHandler, createAppError } from '@/middleware/errorHandler';
import { AuthenticatedRequest, requireRole } from '@/middleware/auth';
import { sanitizeInput } from '@/middleware/sanitization';
import { logger } from '@/services/logger';
import { securityAudit, SecurityEventType, SecurityEventSeverity } from '@/services/securityAudit';
import { io } from '@/app';
import prisma from '@/db';
import {
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  getTasksAssignedBy,
  getTasksAssignedTo,
  getAllTasks,
  getTaskById,
  filterCompletionNote,
} from '@/services/taskService';
import { UserRole } from '@prisma/client';
import { isPresident } from '@/utils/rolePrecedence';

const router = express.Router();

/**
 * POST /api/tasks
 * Create a new task (assigner only)
 */
router.post(
  '/',
  [
    body('title')
      .trim()
      .isLength({ min: 1, max: 150 })
      .withMessage('Title must be between 1 and 150 characters'),
    body('description').optional().isString(),
    body('priority')
      .optional()
      .isIn(Object.values(TaskPriority))
      .withMessage(`Priority must be one of: ${Object.values(TaskPriority).join(', ')}`),
    body('dueDate').optional().isISO8601().withMessage('Due date must be a valid ISO8601 date'),
    body('assigneeIds')
      .isArray({ min: 1 })
      .withMessage('At least one assignee is required'),
    body('assigneeIds.*').isUUID().withMessage('Each assignee ID must be a valid UUID'),
  ],
  sanitizeInput,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { title, description, priority, dueDate, assigneeIds } = req.body;

    const task = await createTask(req.user!.id, {
      title,
      description,
      priority,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      assigneeIds,
    });

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'TASK_CREATED',
        resource: 'tasks',
        details: {
          taskId: task.id,
          assigneeIds: assigneeIds,
          priority: task.priority,
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      },
    });

    // Broadcast WebSocket event to all assignees and assigner
    const userIds = [req.user!.id, ...task.assignees.map((a) => a.id)];
    userIds.forEach((userId) => {
      io.to(`user:${userId}`).emit('task:created', {
        type: 'task_created',
        task: {
          ...task,
          completionNote: undefined, // Don't send completion note in creation event
        },
        createdBy: req.user!.id,
        timestamp: new Date().toISOString(),
      });
    });

    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      data: task,
    });
  })
);

/**
 * GET /api/tasks/assigned-by
 * Get tasks created by the current user
 */
router.get(
  '/assigned-by',
  [
    query('status')
      .optional()
      .isIn(Object.values(TaskStatus))
      .withMessage(`Status must be one of: ${Object.values(TaskStatus).join(', ')}`),
    query('priority')
      .optional()
      .isIn(Object.values(TaskPriority))
      .withMessage(`Priority must be one of: ${Object.values(TaskPriority).join(', ')}`),
  ],
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const filters: any = {};
    if (req.query.status) {
      filters.status = req.query.status as TaskStatus;
    }
    if (req.query.priority) {
      filters.priority = req.query.priority as TaskPriority;
    }

    const tasks = await getTasksAssignedBy(req.user!.id, filters);

    // Filter completion notes based on permissions
    const filteredTasks = tasks.map((task) =>
      filterCompletionNote(task, req.user!.id, req.user!.role)
    );

    res.json({
      success: true,
      data: filteredTasks,
    });
  })
);

/**
 * GET /api/tasks/assigned-to
 * Get tasks assigned to the current user
 */
router.get(
  '/assigned-to',
  [
    query('status')
      .optional()
      .isIn(Object.values(TaskStatus))
      .withMessage(`Status must be one of: ${Object.values(TaskStatus).join(', ')}`),
    query('priority')
      .optional()
      .isIn(Object.values(TaskPriority))
      .withMessage(`Priority must be one of: ${Object.values(TaskPriority).join(', ')}`),
  ],
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const filters: any = {};
    if (req.query.status) {
      filters.status = req.query.status as TaskStatus;
    }
    if (req.query.priority) {
      filters.priority = req.query.priority as TaskPriority;
    }

    const tasks = await getTasksAssignedTo(req.user!.id, filters);

    // Filter completion notes based on permissions
    const filteredTasks = tasks.map((task) =>
      filterCompletionNote(task, req.user!.id, req.user!.role)
    );

    res.json({
      success: true,
      data: filteredTasks,
    });
  })
);

/**
 * GET /api/tasks
 * Get all tasks (President only)
 */
router.get(
  '/',
  requireRole([UserRole.PRESIDENT]),
  [
    query('status')
      .optional()
      .isIn(Object.values(TaskStatus))
      .withMessage(`Status must be one of: ${Object.values(TaskStatus).join(', ')}`),
    query('priority')
      .optional()
      .isIn(Object.values(TaskPriority))
      .withMessage(`Priority must be one of: ${Object.values(TaskPriority).join(', ')}`),
    query('assignerId').optional().isUUID().withMessage('Assigner ID must be a valid UUID'),
    query('assigneeId').optional().isUUID().withMessage('Assignee ID must be a valid UUID'),
    query('dueDateFrom')
      .optional()
      .isISO8601()
      .withMessage('Due date from must be a valid ISO8601 date'),
    query('dueDateTo')
      .optional()
      .isISO8601()
      .withMessage('Due date to must be a valid ISO8601 date'),
  ],
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const filters: any = {};
    if (req.query.status) {
      filters.status = req.query.status as TaskStatus;
    }
    if (req.query.priority) {
      filters.priority = req.query.priority as TaskPriority;
    }
    if (req.query.assignerId) {
      filters.assignerId = req.query.assignerId as string;
    }
    if (req.query.assigneeId) {
      filters.assigneeId = req.query.assigneeId as string;
    }
    if (req.query.dueDateFrom) {
      filters.dueDateFrom = new Date(req.query.dueDateFrom as string);
    }
    if (req.query.dueDateTo) {
      filters.dueDateTo = new Date(req.query.dueDateTo as string);
    }

    const tasks = await getAllTasks(filters);

    // Filter completion notes based on permissions
    const filteredTasks = tasks.map((task) =>
      filterCompletionNote(task, req.user!.id, req.user!.role)
    );

    res.json({
      success: true,
      data: filteredTasks,
    });
  })
);

/**
 * GET /api/tasks/:id
 * Get a single task by ID
 */
router.get(
  '/:id',
  [param('id').isUUID().withMessage('Task ID must be a valid UUID')],
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { id } = req.params;
    const task = await getTaskById(id, req.user!.id, req.user!.role);

    // Filter completion note based on permissions
    const filteredTask = filterCompletionNote(task, req.user!.id, req.user!.role);

    res.json({
      success: true,
      data: filteredTask,
    });
  })
);

/**
 * PATCH /api/tasks/:id/status
 * Update task status (assignee only)
 */
router.patch(
  '/:id/status',
  [
    param('id').isUUID().withMessage('Task ID must be a valid UUID'),
    body('status')
      .isIn(Object.values(TaskStatus))
      .withMessage(`Status must be one of: ${Object.values(TaskStatus).join(', ')}`),
    body('completionNote')
      .optional()
      .isString()
      .isLength({ max: 500 })
      .withMessage('Completion note must be at most 500 characters'),
  ],
  sanitizeInput,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { id } = req.params;
    const { status, completionNote } = req.body;

    const oldTask = await prisma.task.findUnique({
      where: { id },
      include: {
        assigner: { select: { id: true } },
        assignees: { include: { user: { select: { id: true } } } },
      },
    });

    if (!oldTask) {
      throw createAppError('Task not found', 404);
    }

    const task = await updateTaskStatus(id, req.user!.id, req.user!.role, {
      status,
      completionNote,
    });

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'TASK_STATUS_UPDATED',
        resource: 'tasks',
        details: {
          taskId: id,
          oldStatus: oldTask.status,
          newStatus: status,
          hasCompletionNote: !!completionNote,
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      },
    });

    // Broadcast WebSocket event to assigner, all assignees, and President
    const userIds = [
      oldTask.assignerId,
      ...oldTask.assignees.map((ta) => ta.userId),
    ];
    userIds.forEach((userId) => {
      io.to(`user:${userId}`).emit('task:updated', {
        type: 'task_updated',
        task: {
          ...task,
          completionNote: filterCompletionNote(task, req.user!.id, req.user!.role)
            .completionNote,
        },
        updatedBy: req.user!.id,
        timestamp: new Date().toISOString(),
      });
    });
    io.to('role:president').emit('task:updated', {
      type: 'task_updated',
      task: {
        ...task,
        completionNote: filterCompletionNote(task, req.user!.id, req.user!.role)
          .completionNote,
      },
      updatedBy: req.user!.id,
      timestamp: new Date().toISOString(),
    });

    // If task is completed, send a special event
    if (status === TaskStatus.DONE) {
      userIds.forEach((userId) => {
        io.to(`user:${userId}`).emit('task:completed', {
          type: 'task_completed',
          task: {
            ...task,
            completionNote: filterCompletionNote(task, req.user!.id, req.user!.role)
              .completionNote,
          },
          completedBy: req.user!.id,
          timestamp: new Date().toISOString(),
        });
      });
      io.to('role:president').emit('task:completed', {
        type: 'task_completed',
        task: {
          ...task,
          completionNote: filterCompletionNote(task, req.user!.id, req.user!.role)
            .completionNote,
        },
        completedBy: req.user!.id,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      message: 'Task status updated successfully',
      data: filterCompletionNote(task, req.user!.id, req.user!.role),
    });
  })
);

/**
 * PATCH /api/tasks/:id
 * Update task (assigner only)
 */
router.patch(
  '/:id',
  [
    param('id').isUUID().withMessage('Task ID must be a valid UUID'),
    body('title')
      .optional()
      .trim()
      .isLength({ min: 1, max: 150 })
      .withMessage('Title must be between 1 and 150 characters'),
    body('description').optional().isString(),
    body('priority')
      .optional()
      .isIn(Object.values(TaskPriority))
      .withMessage(`Priority must be one of: ${Object.values(TaskPriority).join(', ')}`),
    body('dueDate').optional().isISO8601().withMessage('Due date must be a valid ISO8601 date'),
    body('assigneeIds')
      .optional()
      .isArray({ min: 1 })
      .withMessage('At least one assignee is required'),
    body('assigneeIds.*').optional().isUUID().withMessage('Each assignee ID must be a valid UUID'),
  ],
  sanitizeInput,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { id } = req.params;
    const { title, description, priority, dueDate, assigneeIds } = req.body;

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (priority !== undefined) updateData.priority = priority;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (assigneeIds !== undefined) updateData.assigneeIds = assigneeIds;

    const oldTask = await prisma.task.findUnique({
      where: { id },
      include: {
        assigner: { select: { id: true } },
        assignees: { include: { user: { select: { id: true } } } },
      },
    });

    if (!oldTask) {
      throw createAppError('Task not found', 404);
    }

    const task = await updateTask(id, req.user!.id, updateData);

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'TASK_UPDATED',
        resource: 'tasks',
        details: {
          taskId: id,
          updates: updateData,
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      },
    });

    // Broadcast WebSocket event to assigner, all assignees (old and new), and President
    const oldUserIds = [
      oldTask.assignerId,
      ...oldTask.assignees.map((ta) => ta.userId),
    ];
    const newUserIds = [
      task.assignerId,
      ...task.assignees.map((a) => a.id),
    ];
    const allUserIds = [...new Set([...oldUserIds, ...newUserIds])];

    allUserIds.forEach((userId) => {
      io.to(`user:${userId}`).emit('task:updated', {
        type: 'task_updated',
        task: {
          ...task,
          completionNote: filterCompletionNote(task, req.user!.id, req.user!.role)
            .completionNote,
        },
        updatedBy: req.user!.id,
        timestamp: new Date().toISOString(),
      });
    });
    io.to('role:president').emit('task:updated', {
      type: 'task_updated',
      task: {
        ...task,
        completionNote: filterCompletionNote(task, req.user!.id, req.user!.role)
          .completionNote,
      },
      updatedBy: req.user!.id,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'Task updated successfully',
      data: filterCompletionNote(task, req.user!.id, req.user!.role),
    });
  })
);

/**
 * DELETE /api/tasks/:id
 * Delete task (President only)
 */
router.delete(
  '/:id',
  requireRole([UserRole.PRESIDENT]),
  [
    param('id').isUUID().withMessage('Task ID must be a valid UUID'),
  ],
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { id } = req.params;

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        assigner: { select: { id: true } },
        assignees: { include: { user: { select: { id: true } } } },
      },
    });

    if (!task) {
      throw createAppError('Task not found', 404);
    }

    await deleteTask(id, req.user!.id, req.user!.role);

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'TASK_DELETED',
        resource: 'tasks',
        details: {
          taskId: id,
          taskTitle: task.title || 'Unknown',
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      },
    });

    // Broadcast WebSocket event
    const userIds = [
      task.assignerId,
      ...task.assignees.map((ta) => ta.userId),
    ];
    userIds.forEach((userId) => {
      io.to(`user:${userId}`).emit('task:deleted', {
        type: 'task_deleted',
        taskId: id,
        deletedBy: req.user!.id,
        timestamp: new Date().toISOString(),
      });
    });
    io.to('role:president').emit('task:deleted', {
      type: 'task_deleted',
      taskId: id,
      deletedBy: req.user!.id,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'Task deleted successfully',
    });
  })
);

export default router;

