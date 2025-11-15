import { Task, TaskStatus, TaskPriority, UserRole } from '@prisma/client';
import prisma from '@/db';
import { createAppError } from '@/middleware/errorHandler';
import { hasHigherPrecedence, canAssignTasks, isPresident } from '@/utils/rolePrecedence';
import { logger } from '@/services/logger';

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: Date;
  assigneeIds: string[]; // Changed to array for multi-user assignment
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: Date;
  assigneeIds?: string[];
}

export interface UpdateTaskStatusInput {
  status: TaskStatus;
  completionNote?: string;
}

export interface TaskAssignee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
}

export interface TaskWithRelations extends Task {
  assigner: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: UserRole;
  };
  assignees: TaskAssignee[];
}

/**
 * Create a new task with multiple assignees
 */
export const createTask = async (
  assignerId: string,
  input: CreateTaskInput
): Promise<TaskWithRelations> => {
  // Validate assigneeIds array
  if (!input.assigneeIds || input.assigneeIds.length === 0) {
    throw createAppError('At least one assignee is required', 400);
  }

  // Get assigner details
  const assigner = await prisma.user.findUnique({
    where: { id: assignerId },
    select: { id: true, role: true, isActive: true },
  });

  if (!assigner || !assigner.isActive) {
    throw createAppError('Assigner not found or inactive', 404);
  }

  // Check if assigner can assign tasks
  if (!canAssignTasks(assigner.role)) {
    throw createAppError('You do not have permission to assign tasks', 403);
  }

  // Validate all assignees
  const assignees = await prisma.user.findMany({
    where: {
      id: { in: input.assigneeIds },
      isActive: true,
    },
    select: { id: true, role: true, isActive: true },
  });

  if (assignees.length !== input.assigneeIds.length) {
    throw createAppError('One or more assignees not found or inactive', 404);
  }

  // Validate role precedence for all assignees
  for (const assignee of assignees) {
    if (!hasHigherPrecedence(assigner.role, assignee.role)) {
      throw createAppError(
        `You can only assign tasks to users with lower rank than you. ${assignee.id} has equal or higher rank`,
        403
      );
    }
  }

  // Prevent self-assignment
  if (input.assigneeIds.includes(assignerId)) {
    throw createAppError('You cannot assign tasks to yourself', 400);
  }

  // Create task with assignees
  const task = await prisma.task.create({
    data: {
      title: input.title,
      description: input.description,
      priority: input.priority || TaskPriority.NORMAL,
      assignerId,
      dueDate: input.dueDate,
      status: TaskStatus.OPEN,
      assignees: {
        create: input.assigneeIds.map((userId) => ({
          userId,
        })),
      },
    },
    include: {
      assigner: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
        },
      },
      assignees: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
        },
      },
    },
  });

  logger.info('Task created', {
    taskId: task.id,
    assignerId,
    assigneeIds: input.assigneeIds,
  });

  // Transform assignees to match TaskWithRelations interface
  return {
    ...task,
    assignees: task.assignees.map((ta) => ta.user),
  } as TaskWithRelations;
};

/**
 * Update task (assigner only)
 */
export const updateTask = async (
  taskId: string,
  assignerId: string,
  input: UpdateTaskInput
): Promise<TaskWithRelations> => {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assigner: {
        select: { id: true, role: true },
      },
      assignees: {
        include: {
          user: {
            select: { id: true, role: true },
          },
        },
      },
    },
  });

  if (!task) {
    throw createAppError('Task not found', 404);
  }

  // Only assigner can update task
  if (task.assignerId !== assignerId) {
    throw createAppError('Only the task assigner can edit this task', 403);
  }

  // Prepare update data
  const updateData: any = {
    updatedAt: new Date(),
  };

  if (input.title !== undefined) {
    updateData.title = input.title;
  }
  if (input.description !== undefined) {
    updateData.description = input.description;
  }
  if (input.priority !== undefined) {
    updateData.priority = input.priority;
  }
  if (input.dueDate !== undefined) {
    updateData.dueDate = input.dueDate;
  }

  // Handle assignee updates
  if (input.assigneeIds !== undefined) {
    if (input.assigneeIds.length === 0) {
      throw createAppError('At least one assignee is required', 400);
    }

    // Validate new assignees
    const assigner = await prisma.user.findUnique({
      where: { id: assignerId },
      select: { role: true },
    });

    if (!assigner) {
      throw createAppError('Assigner not found', 404);
    }

    const newAssignees = await prisma.user.findMany({
      where: {
        id: { in: input.assigneeIds },
        isActive: true,
      },
      select: { id: true, role: true },
    });

    if (newAssignees.length !== input.assigneeIds.length) {
      throw createAppError('One or more assignees not found or inactive', 404);
    }

    // Validate role precedence
    for (const assignee of newAssignees) {
      if (!hasHigherPrecedence(assigner.role, assignee.role)) {
        throw createAppError(
          `You can only assign tasks to users with lower rank than you`,
          403
        );
      }
    }

    // Prevent self-assignment
    if (input.assigneeIds.includes(assignerId)) {
      throw createAppError('You cannot assign tasks to yourself', 400);
    }

    // Update assignees (delete old, create new)
    await prisma.taskAssignee.deleteMany({
      where: { taskId },
    });

    updateData.assignees = {
      create: input.assigneeIds.map((userId) => ({
        userId,
      })),
    };
  }

  const updatedTask = await prisma.task.update({
    where: { id: taskId },
    data: updateData,
    include: {
      assigner: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
        },
      },
      assignees: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
        },
      },
    },
  });

  logger.info('Task updated', {
    taskId,
    assignerId,
    updates: input,
  });

  return {
    ...updatedTask,
    assignees: updatedTask.assignees.map((ta) => ta.user),
  } as TaskWithRelations;
};

/**
 * Delete task (President only)
 */
export const deleteTask = async (
  taskId: string,
  userId: string,
  userRole: UserRole
): Promise<void> => {
  // Only President can delete tasks
  if (!isPresident(userRole)) {
    throw createAppError('Only President can delete tasks', 403);
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true },
  });

  if (!task) {
    throw createAppError('Task not found', 404);
  }

  // Delete task (cascade will delete TaskAssignee records)
  await prisma.task.delete({
    where: { id: taskId },
  });

  logger.info('Task deleted', {
    taskId,
    deletedBy: userId,
  });
};

/**
 * Update task status (any assignee can update)
 */
export const updateTaskStatus = async (
  taskId: string,
  userId: string,
  userRole: UserRole,
  input: UpdateTaskStatusInput
): Promise<TaskWithRelations> => {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assigner: {
        select: {
          id: true,
          role: true,
        },
      },
      assignees: {
        include: {
          user: {
            select: {
              id: true,
              role: true,
            },
          },
        },
      },
    },
  });

  if (!task) {
    throw createAppError('Task not found', 404);
  }

  // Check if user is an assignee
  const isAssignee = task.assignees.some((ta) => ta.userId === userId);
  if (!isAssignee) {
    throw createAppError('You can only update tasks assigned to you', 403);
  }

  // Validate status transition
  const validTransitions: Record<TaskStatus, TaskStatus[]> = {
    [TaskStatus.OPEN]: [TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED],
    [TaskStatus.IN_PROGRESS]: [TaskStatus.BLOCKED, TaskStatus.DONE],
    [TaskStatus.BLOCKED]: [TaskStatus.IN_PROGRESS, TaskStatus.DONE],
    [TaskStatus.DONE]: [], // Cannot transition from DONE
  };

  if (!validTransitions[task.status].includes(input.status)) {
    throw createAppError(
      `Invalid status transition from ${task.status} to ${input.status}`,
      400
    );
  }

  // If marking as DONE, set completedAt
  const updateData: any = {
    status: input.status,
    updatedAt: new Date(),
  };

  if (input.status === TaskStatus.DONE) {
    updateData.completedAt = new Date();
    if (input.completionNote) {
      updateData.completionNote = input.completionNote;
    }
  } else {
    // Clear completion note if status is changed from DONE
    if (task.status === TaskStatus.DONE) {
      updateData.completionNote = null;
      updateData.completedAt = null;
    }
  }

  const updatedTask = await prisma.task.update({
    where: { id: taskId },
    data: updateData,
    include: {
      assigner: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
        },
      },
      assignees: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
        },
      },
    },
  });

  logger.info('Task status updated', {
    taskId,
    userId,
    oldStatus: task.status,
    newStatus: input.status,
  });

  return {
    ...updatedTask,
    assignees: updatedTask.assignees.map((ta) => ta.user),
  } as TaskWithRelations;
};

/**
 * Get tasks assigned by a user
 */
export const getTasksAssignedBy = async (
  assignerId: string,
  filters?: {
    status?: TaskStatus;
    priority?: TaskPriority;
  }
): Promise<TaskWithRelations[]> => {
  const where: any = {
    assignerId,
  };

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.priority) {
    where.priority = filters.priority;
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      assigner: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
        },
      },
      assignees: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
        },
      },
    },
    orderBy: [
      { createdAt: 'desc' },
    ],
  });

  return tasks.map((task) => ({
    ...task,
    assignees: task.assignees.map((ta) => ta.user),
  })) as TaskWithRelations[];
};

/**
 * Get tasks assigned to a user
 */
export const getTasksAssignedTo = async (
  assigneeId: string,
  filters?: {
    status?: TaskStatus;
    priority?: TaskPriority;
  }
): Promise<TaskWithRelations[]> => {
  const tasks = await prisma.task.findMany({
    where: {
      assignees: {
        some: {
          userId: assigneeId,
        },
      },
      ...(filters?.status && { status: filters.status }),
      ...(filters?.priority && { priority: filters.priority }),
    },
    include: {
      assigner: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
        },
      },
      assignees: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
        },
      },
    },
    orderBy: [
      { createdAt: 'desc' },
    ],
  });

  return tasks.map((task) => ({
    ...task,
    assignees: task.assignees.map((ta) => ta.user),
  })) as TaskWithRelations[];
};

/**
 * Get all tasks (President only)
 */
export const getAllTasks = async (
  filters?: {
    status?: TaskStatus;
    priority?: TaskPriority;
    assignerId?: string;
    assigneeId?: string;
    dueDateFrom?: Date;
    dueDateTo?: Date;
  }
): Promise<TaskWithRelations[]> => {
  const where: any = {};

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.priority) {
    where.priority = filters.priority;
  }

  if (filters?.assignerId) {
    where.assignerId = filters.assignerId;
  }

  if (filters?.assigneeId) {
    where.assignees = {
      some: {
        userId: filters.assigneeId,
      },
    };
  }

  if (filters?.dueDateFrom || filters?.dueDateTo) {
    where.dueDate = {};
    if (filters.dueDateFrom) {
      where.dueDate.gte = filters.dueDateFrom;
    }
    if (filters.dueDateTo) {
      where.dueDate.lte = filters.dueDateTo;
    }
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      assigner: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
        },
      },
      assignees: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
        },
      },
    },
    orderBy: [
      { createdAt: 'desc' },
    ],
  });

  return tasks.map((task) => ({
    ...task,
    assignees: task.assignees.map((ta) => ta.user),
  })) as TaskWithRelations[];
};

/**
 * Get a single task by ID
 */
export const getTaskById = async (
  taskId: string,
  userId: string,
  userRole: UserRole
): Promise<TaskWithRelations> => {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assigner: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
        },
      },
      assignees: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
        },
      },
    },
  });

  if (!task) {
    throw createAppError('Task not found', 404);
  }

  // Check access: assigner, any assignee, or President can view
  const isAssignee = task.assignees.some((ta) => ta.userId === userId);
  const canView =
    task.assignerId === userId || isAssignee || isPresident(userRole);

  if (!canView) {
    throw createAppError('You do not have permission to view this task', 403);
  }

  return {
    ...task,
    assignees: task.assignees.map((ta) => ta.user),
  } as TaskWithRelations;
};

/**
 * Filter completion note visibility
 * Only assigner, any assignee, and President can see completion notes
 */
export const filterCompletionNote = (
  task: TaskWithRelations,
  userId: string,
  userRole: UserRole
): TaskWithRelations => {
  const isAssignee = task.assignees.some((a) => a.id === userId);
  const canViewNote =
    task.assignerId === userId || isAssignee || isPresident(userRole);

  if (!canViewNote) {
    return {
      ...task,
      completionNote: null,
    };
  }

  return task;
};
