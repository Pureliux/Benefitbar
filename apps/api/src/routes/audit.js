import express from 'express';
import pb from '../utils/pocketbaseClient.js';
import logger from '../utils/logger.js';

const router = express.Router();

// POST /audit-log - Create audit log entry
router.post('/', async (req, res) => {
  const { action, entityType, entityId, beforeValue, afterValue } = req.body;

  // Validate inputs
  if (!action || !entityType || !entityId) {
    return res.status(400).json({ error: 'Missing required fields: action, entityType, entityId' });
  }

  // Validate user is admin
  const userEmail = req.auth?.email;
  if (!userEmail) {
    throw new Error('User not authenticated');
  }

  const employee = await pb.collection('employees').getFirstListItem(`email = "${userEmail}"`);
  if (!employee?.isAdmin) {
    throw new Error('Unauthorized: Only admins can create audit logs');
  }

  // Create audit log record
  const auditLog = await pb.collection('auditLog').create({
    action,
    entityType,
    entityId,
    beforeValue: beforeValue ? JSON.stringify(beforeValue) : null,
    afterValue: afterValue ? JSON.stringify(afterValue) : null,
    actorEmail: userEmail,
    createdAt: new Date().toISOString(),
  });

  logger.info(`Audit log created: ${action} on ${entityType} ${entityId}`);

  res.json(auditLog);
});

// GET /audit-log - Get audit logs
router.get('/', async (req, res) => {
  const { action, entityType, startDate, endDate, page = 1, perPage = 50 } = req.query;

  // Validate user is admin
  const userEmail = req.auth?.email;
  if (!userEmail) {
    throw new Error('User not authenticated');
  }

  const employee = await pb.collection('employees').getFirstListItem(`email = "${userEmail}"`);
  if (!employee?.isAdmin) {
    throw new Error('Unauthorized: Only admins can view audit logs');
  }

  // Build filter
  let filter = '';
  if (action) {
    filter += `action = "${action}"`;
  }
  if (entityType) {
    filter += filter ? ` && entityType = "${entityType}"` : `entityType = "${entityType}"`;
  }
  if (startDate) {
    const start = new Date(startDate).toISOString();
    filter += filter ? ` && createdAt >= "${start}"` : `createdAt >= "${start}"`;
  }
  if (endDate) {
    const end = new Date(endDate).toISOString();
    filter += filter ? ` && createdAt <= "${end}"` : `createdAt <= "${end}"`;
  }

  // Get audit logs
  const auditLogs = await pb.collection('auditLog').getList(parseInt(page), parseInt(perPage), {
    filter: filter || undefined,
    sort: '-createdAt',
  });

  logger.info(`Audit logs retrieved: ${auditLogs.items.length} items`);

  res.json({
    items: auditLogs.items,
    page: auditLogs.page,
    perPage: auditLogs.perPage,
    totalItems: auditLogs.totalItems,
    totalPages: auditLogs.totalPages,
  });
});

export default router;
