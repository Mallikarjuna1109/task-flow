import { Router } from 'express';
import authRoutes from './auth.routes';
import projectRoutes from './project.routes';
import jobRoutes from './job.routes';
import orgRoutes from './org.routes';
import searchRoutes from './search.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/projects', projectRoutes);
router.use('/jobs', jobRoutes);
router.use('/organizations', orgRoutes);
router.use('/tasks', searchRoutes);

export default router;
