import { Router } from 'express';
import { taskController } from '../controllers/task.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { searchTasksSchema } from '../validators/task.validator';

const router = Router();

router.use(authenticate);

router.get('/search', validate(searchTasksSchema), taskController.search);

export default router;
