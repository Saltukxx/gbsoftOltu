import express from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { WarehouseTransactionType, WarehouseItemCategory, WarehouseItemCondition } from '@prisma/client';
import { asyncHandler, createAppError } from '@/middleware/errorHandler';
import { AuthenticatedRequest, requireWarehouseAccess } from '@/middleware/auth';
import { sanitizeInput } from '@/middleware/sanitization';
import { logger } from '@/services/logger';
import { securityAudit, SecurityEventType } from '@/services/securityAudit';
import { io } from '@/app';
import prisma from '@/db';

const router = express.Router();

// Apply warehouse access middleware to all routes
router.use(requireWarehouseAccess);

/**
 * GET /api/warehouse/items
 * List all warehouse items with filters, pagination, and search
 */
router.get(
  '/items',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('search').optional().isString(),
    query('category').optional().isIn(Object.values(WarehouseItemCategory)),
    query('condition').optional().isIn(Object.values(WarehouseItemCondition)),
    query('location').optional().isString(),
    query('isActive').optional().isBoolean(),
  ],
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search as string;
    const category = req.query.category as WarehouseItemCategory | undefined;
    const condition = req.query.condition as WarehouseItemCondition | undefined;
    const location = req.query.location as string | undefined;
    const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;

    const where: any = {
      deletedAt: null,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (category) {
      where.category = category;
    }

    if (condition) {
      where.condition = condition;
    }

    if (location) {
      where.location = { contains: location, mode: 'insensitive' };
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [items, total] = await Promise.all([
      prisma.warehouseItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          transactions: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            include: {
              user: {
                select: { id: true, firstName: true, lastName: true, email: true },
              },
              assignedUser: {
                select: { id: true, firstName: true, lastName: true, email: true },
              },
            },
          },
        },
      }),
      prisma.warehouseItem.count({ where }),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  })
);

/**
 * GET /api/warehouse/items/:id
 * Get single warehouse item with transaction history
 */
router.get(
  '/items/:id',
  [param('id').isUUID().withMessage('Invalid item ID')],
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const item = await prisma.warehouseItem.findUnique({
      where: { id: req.params.id },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
            assignedUser: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });

    if (!item || item.deletedAt) {
      throw createAppError('Warehouse item not found', 404);
    }

    res.json({
      success: true,
      data: item,
    });
  })
);

/**
 * POST /api/warehouse/items
 * Create new warehouse item
 */
router.post(
  '/items',
  [
    body('name').trim().isLength({ min: 1, max: 255 }).withMessage('Name is required and must be less than 255 characters'),
    body('description').optional().isString(),
    body('category').isIn(Object.values(WarehouseItemCategory)).withMessage('Invalid category'),
    body('sku').optional().isString(),
    body('quantity').isInt({ min: 0 }).withMessage('Quantity must be a non-negative integer'),
    body('location').trim().isLength({ min: 1 }).withMessage('Location is required'),
    body('condition').optional().isIn(Object.values(WarehouseItemCondition)),
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

    const { name, description, category, sku, quantity, location, condition } = req.body;

    // Check if SKU already exists
    if (sku) {
      const existingItem = await prisma.warehouseItem.findUnique({
        where: { sku },
      });
      if (existingItem) {
        throw createAppError('Item with this SKU already exists', 400);
      }
    }

    const item = await prisma.warehouseItem.create({
      data: {
        name,
        description,
        category,
        sku: sku || null,
        quantity,
        location,
        condition: condition || WarehouseItemCondition.GOOD,
      },
    });

    // Create initial transaction for item creation
    await prisma.warehouseTransaction.create({
      data: {
        itemId: item.id,
        type: WarehouseTransactionType.ADJUSTMENT,
        userId: req.user!.id,
        quantity: quantity,
        previousQuantity: 0,
        newQuantity: quantity,
        notes: 'Initial item creation',
      },
    });

    await securityAudit.logAdminAction(
      SecurityEventType.RESOURCE_CREATED,
      req.user!.id,
      `warehouse_item:${item.id}`,
      { itemName: item.name, category: item.category },
      req
    );

    io.emit('warehouse:item:created', {
      type: 'warehouse_item_created',
      item,
      createdBy: req.user!.id,
      timestamp: new Date().toISOString(),
    });

    res.status(201).json({
      success: true,
      message: 'Warehouse item created successfully',
      data: item,
    });
  })
);

/**
 * PATCH /api/warehouse/items/:id
 * Update warehouse item
 */
router.patch(
  '/items/:id',
  [
    param('id').isUUID().withMessage('Invalid item ID'),
    body('name').optional().trim().isLength({ min: 1, max: 255 }),
    body('description').optional().isString(),
    body('category').optional().isIn(Object.values(WarehouseItemCategory)),
    body('sku').optional().isString(),
    body('location').optional().trim().isLength({ min: 1 }),
    body('condition').optional().isIn(Object.values(WarehouseItemCondition)),
    body('isActive').optional().isBoolean(),
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

    const item = await prisma.warehouseItem.findUnique({
      where: { id: req.params.id },
    });

    if (!item || item.deletedAt) {
      throw createAppError('Warehouse item not found', 404);
    }

    // Check if SKU already exists (if changing SKU)
    if (req.body.sku && req.body.sku !== item.sku) {
      const existingItem = await prisma.warehouseItem.findUnique({
        where: { sku: req.body.sku },
      });
      if (existingItem) {
        throw createAppError('Item with this SKU already exists', 400);
      }
    }

    const updateData: any = {};
    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.category !== undefined) updateData.category = req.body.category;
    if (req.body.sku !== undefined) updateData.sku = req.body.sku || null;
    if (req.body.location !== undefined) updateData.location = req.body.location;
    if (req.body.condition !== undefined) updateData.condition = req.body.condition;
    if (req.body.isActive !== undefined) updateData.isActive = req.body.isActive;

    const updatedItem = await prisma.warehouseItem.update({
      where: { id: req.params.id },
      data: updateData,
    });

    await securityAudit.logAdminAction(
      SecurityEventType.RESOURCE_MODIFIED,
      req.user!.id,
      `warehouse_item:${updatedItem.id}`,
      { changes: updateData },
      req
    );

    io.emit('warehouse:item:updated', {
      type: 'warehouse_item_updated',
      item: updatedItem,
      updatedBy: req.user!.id,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'Warehouse item updated successfully',
      data: updatedItem,
    });
  })
);

/**
 * DELETE /api/warehouse/items/:id
 * Soft delete warehouse item
 */
router.delete(
  '/items/:id',
  [param('id').isUUID().withMessage('Invalid item ID')],
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const item = await prisma.warehouseItem.findUnique({
      where: { id: req.params.id },
    });

    if (!item || item.deletedAt) {
      throw createAppError('Warehouse item not found', 404);
    }

    const deletedItem = await prisma.warehouseItem.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await securityAudit.logAdminAction(
      SecurityEventType.RESOURCE_DELETED,
      req.user!.id,
      `warehouse_item:${deletedItem.id}`,
      { itemName: deletedItem.name },
      req
    );

    io.emit('warehouse:item:deleted', {
      type: 'warehouse_item_deleted',
      itemId: deletedItem.id,
      deletedBy: req.user!.id,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'Warehouse item deleted successfully',
    });
  })
);

/**
 * POST /api/warehouse/items/:id/checkout
 * Check out item (assign to user)
 */
router.post(
  '/items/:id/checkout',
  [
    param('id').isUUID().withMessage('Invalid item ID'),
    body('assignedUserId').isUUID().withMessage('Assigned user ID is required'),
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('notes').optional().isString(),
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

    const { assignedUserId, quantity, notes } = req.body;

    const item = await prisma.warehouseItem.findUnique({
      where: { id: req.params.id },
    });

    if (!item || item.deletedAt || !item.isActive) {
      throw createAppError('Warehouse item not found or inactive', 404);
    }

    if (item.quantity < quantity) {
      throw createAppError(`Insufficient quantity. Available: ${item.quantity}`, 400);
    }

    // Verify assigned user exists
    const assignedUser = await prisma.user.findUnique({
      where: { id: assignedUserId },
    });

    if (!assignedUser || !assignedUser.isActive) {
      throw createAppError('Assigned user not found or inactive', 404);
    }

    const previousQuantity = item.quantity;
    const newQuantity = previousQuantity - quantity;

    // Update item quantity
    const updatedItem = await prisma.warehouseItem.update({
      where: { id: req.params.id },
      data: { quantity: newQuantity },
    });

    // Create transaction
    const transaction = await prisma.warehouseTransaction.create({
      data: {
        itemId: item.id,
        type: WarehouseTransactionType.CHECK_OUT,
        userId: req.user!.id,
        assignedUserId,
        quantity,
        previousQuantity,
        newQuantity,
        notes: notes || `Checked out ${quantity} item(s)`,
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        assignedUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    await securityAudit.logAdminAction(
      SecurityEventType.RESOURCE_MODIFIED,
      req.user!.id,
      `warehouse_item:${item.id}`,
      { action: 'CHECK_OUT', assignedUserId, quantity },
      req
    );

    io.emit('warehouse:transaction:created', {
      type: 'warehouse_transaction_created',
      transaction,
      createdBy: req.user!.id,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'Item checked out successfully',
      data: {
        item: updatedItem,
        transaction,
      },
    });
  })
);

/**
 * POST /api/warehouse/items/:id/checkin
 * Check in item (return from user)
 */
router.post(
  '/items/:id/checkin',
  [
    param('id').isUUID().withMessage('Invalid item ID'),
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
    body('notes').optional().isString(),
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

    const { quantity, notes } = req.body;

    const item = await prisma.warehouseItem.findUnique({
      where: { id: req.params.id },
    });

    if (!item || item.deletedAt || !item.isActive) {
      throw createAppError('Warehouse item not found or inactive', 404);
    }

    const previousQuantity = item.quantity;
    const newQuantity = previousQuantity + quantity;

    // Update item quantity
    const updatedItem = await prisma.warehouseItem.update({
      where: { id: req.params.id },
      data: { quantity: newQuantity },
    });

    // Create transaction
    const transaction = await prisma.warehouseTransaction.create({
      data: {
        itemId: item.id,
        type: WarehouseTransactionType.CHECK_IN,
        userId: req.user!.id,
        quantity,
        previousQuantity,
        newQuantity,
        notes: notes || `Checked in ${quantity} item(s)`,
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    await securityAudit.logAdminAction(
      SecurityEventType.RESOURCE_MODIFIED,
      req.user!.id,
      `warehouse_item:${item.id}`,
      { action: 'CHECK_IN', quantity },
      req
    );

    io.emit('warehouse:transaction:created', {
      type: 'warehouse_transaction_created',
      transaction,
      createdBy: req.user!.id,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'Item checked in successfully',
      data: {
        item: updatedItem,
        transaction,
      },
    });
  })
);

/**
 * POST /api/warehouse/items/:id/transfer
 * Transfer item between locations
 */
router.post(
  '/items/:id/transfer',
  [
    param('id').isUUID().withMessage('Invalid item ID'),
    body('transferToLocation').trim().isLength({ min: 1 }).withMessage('Transfer location is required'),
    body('quantity').optional().isInt({ min: 1 }),
    body('notes').optional().isString(),
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

    const { transferToLocation, quantity, notes } = req.body;

    const item = await prisma.warehouseItem.findUnique({
      where: { id: req.params.id },
    });

    if (!item || item.deletedAt || !item.isActive) {
      throw createAppError('Warehouse item not found or inactive', 404);
    }

    const transferQuantity = quantity || item.quantity;

    if (item.quantity < transferQuantity) {
      throw createAppError(`Insufficient quantity. Available: ${item.quantity}`, 400);
    }

    const previousQuantity = item.quantity;
    const newQuantity = previousQuantity - transferQuantity;

    // Update item quantity and location
    const updatedItem = await prisma.warehouseItem.update({
      where: { id: req.params.id },
      data: {
        quantity: newQuantity,
        location: transferToLocation,
      },
    });

    // Create transaction
    const transaction = await prisma.warehouseTransaction.create({
      data: {
        itemId: item.id,
        type: WarehouseTransactionType.TRANSFER,
        userId: req.user!.id,
        quantity: transferQuantity,
        previousQuantity,
        newQuantity,
        transferToLocation,
        notes: notes || `Transferred ${transferQuantity} item(s) to ${transferToLocation}`,
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    await securityAudit.logAdminAction(
      SecurityEventType.RESOURCE_MODIFIED,
      req.user!.id,
      `warehouse_item:${item.id}`,
      { action: 'TRANSFER', transferToLocation, quantity: transferQuantity },
      req
    );

    io.emit('warehouse:transaction:created', {
      type: 'warehouse_transaction_created',
      transaction,
      createdBy: req.user!.id,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'Item transferred successfully',
      data: {
        item: updatedItem,
        transaction,
      },
    });
  })
);

/**
 * POST /api/warehouse/items/:id/adjustment
 * Manual quantity adjustment
 */
router.post(
  '/items/:id/adjustment',
  [
    param('id').isUUID().withMessage('Invalid item ID'),
    body('newQuantity').isInt({ min: 0 }).withMessage('New quantity must be a non-negative integer'),
    body('notes').trim().isLength({ min: 1 }).withMessage('Notes are required for adjustments'),
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

    const { newQuantity, notes } = req.body;

    const item = await prisma.warehouseItem.findUnique({
      where: { id: req.params.id },
    });

    if (!item || item.deletedAt || !item.isActive) {
      throw createAppError('Warehouse item not found or inactive', 404);
    }

    const previousQuantity = item.quantity;
    const quantityDifference = newQuantity - previousQuantity;

    // Update item quantity
    const updatedItem = await prisma.warehouseItem.update({
      where: { id: req.params.id },
      data: { quantity: newQuantity },
    });

    // Create transaction
    const transaction = await prisma.warehouseTransaction.create({
      data: {
        itemId: item.id,
        type: WarehouseTransactionType.ADJUSTMENT,
        userId: req.user!.id,
        quantity: Math.abs(quantityDifference),
        previousQuantity,
        newQuantity,
        notes,
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    await securityAudit.logAdminAction(
      SecurityEventType.RESOURCE_MODIFIED,
      req.user!.id,
      `warehouse_item:${item.id}`,
      { action: 'ADJUSTMENT', previousQuantity, newQuantity },
      req
    );

    io.emit('warehouse:transaction:created', {
      type: 'warehouse_transaction_created',
      transaction,
      createdBy: req.user!.id,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'Quantity adjusted successfully',
      data: {
        item: updatedItem,
        transaction,
      },
    });
  })
);

/**
 * GET /api/warehouse/transactions
 * Get transaction history with filters
 */
router.get(
  '/transactions',
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('itemId').optional().isUUID(),
    query('userId').optional().isUUID(),
    query('type').optional().isIn(Object.values(WarehouseTransactionType)),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
  ],
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (req.query.itemId) {
      where.itemId = req.query.itemId as string;
    }

    if (req.query.userId) {
      where.userId = req.query.userId as string;
    }

    if (req.query.type) {
      where.type = req.query.type as WarehouseTransactionType;
    }

    if (req.query.startDate || req.query.endDate) {
      where.createdAt = {};
      if (req.query.startDate) {
        where.createdAt.gte = new Date(req.query.startDate as string);
      }
      if (req.query.endDate) {
        where.createdAt.lte = new Date(req.query.endDate as string);
      }
    }

    const [transactions, total] = await Promise.all([
      prisma.warehouseTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          item: {
            select: { id: true, name: true, sku: true, category: true },
          },
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          assignedUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      prisma.warehouseTransaction.count({ where }),
    ]);

    res.json({
      success: true,
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  })
);

/**
 * GET /api/warehouse/transactions/:id
 * Get single transaction details
 */
router.get(
  '/transactions/:id',
  [param('id').isUUID().withMessage('Invalid transaction ID')],
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const transaction = await prisma.warehouseTransaction.findUnique({
      where: { id: req.params.id },
      include: {
        item: true,
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        assignedUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!transaction) {
      throw createAppError('Transaction not found', 404);
    }

    res.json({
      success: true,
      data: transaction,
    });
  })
);

/**
 * GET /api/warehouse/assigned-items
 * Get items assigned to current user
 */
router.get(
  '/assigned-items',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const transactions = await prisma.warehouseTransaction.findMany({
      where: {
        assignedUserId: req.user!.id,
        type: WarehouseTransactionType.CHECK_OUT,
      },
      include: {
        item: true,
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group by item and get latest transaction for each
    const itemMap = new Map();
    transactions.forEach((transaction) => {
      const itemId = transaction.itemId;
      if (!itemMap.has(itemId)) {
        itemMap.set(itemId, transaction);
      }
    });

    const assignedItems = Array.from(itemMap.values());

    res.json({
      success: true,
      data: assignedItems,
    });
  })
);

export default router;

