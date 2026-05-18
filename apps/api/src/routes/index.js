import { Router } from 'express';
import healthCheck from './health-check.js';
import authRouter from './auth.js';
import adminRouter from './admin.js';
import submissionsRouter from './submissions.js';
import attachmentsRouter from './attachments.js';
import auditRouter from './audit.js';

const router = Router();

export default () => {
    router.get('/health', healthCheck);
    router.use('/auth', authRouter);
    router.use('/admin', adminRouter);
    router.use('/submissions', submissionsRouter);
    router.use('/attachments', attachmentsRouter);
    router.use('/audit-log', auditRouter);

    return router;
};
