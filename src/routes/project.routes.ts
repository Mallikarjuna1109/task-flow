import { Router } from 'express';
import { projectController } from '../controllers/project.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  createProjectSchema,
  listProjectsSchema,
  projectIdParamSchema,
  updateProjectSchema,
} from '../validators/project.validator';
import taskRouter from './task.routes';

const router = Router();

router.use(authenticate);

router.post('/', validate(createProjectSchema), projectController.create);
router.get('/', validate(listProjectsSchema), projectController.list);
router.get('/:projectId', validate(projectIdParamSchema), projectController.get);
router.patch('/:projectId', validate(updateProjectSchema), projectController.update);
router.delete('/:projectId', validate(projectIdParamSchema), projectController.remove);
router.get('/:projectId/dashboard', validate(projectIdParamSchema), projectController.dashboard);

// Tasks are nested under a project - /projects/:projectId/tasks/...
router.use('/:projectId/tasks', taskRouter);

export default router;
