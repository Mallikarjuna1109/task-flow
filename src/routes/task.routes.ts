import { Router } from 'express';
import { taskController } from '../controllers/task.controller';
import { validate } from '../middleware/validate.middleware';
import {
  assignTaskSchema,
  bulkUpdateStatusSchema,
  createCommentSchema,
  createTaskSchema,
  listTasksSchema,
  taskIdParamSchema,
  unassignTaskSchema,
  updateTaskSchema,
} from '../validators/task.validator';

// mergeParams: true is required to read :projectId from the parent router.
const router = Router({ mergeParams: true });

router.post('/', validate(createTaskSchema), taskController.create);
router.get('/', validate(listTasksSchema), taskController.list);
router.patch('/bulk-status', validate(bulkUpdateStatusSchema), taskController.bulkUpdateStatus);
router.get('/:taskId', validate(taskIdParamSchema), taskController.get);
router.patch('/:taskId', validate(updateTaskSchema), taskController.update);
router.delete('/:taskId', validate(taskIdParamSchema), taskController.remove);

router.post('/:taskId/assignments', validate(assignTaskSchema), taskController.assign);
router.delete('/:taskId/assignments/:userId', validate(unassignTaskSchema), taskController.unassign);

router.post('/:taskId/comments', validate(createCommentSchema), taskController.addComment);
router.get('/:taskId/comments', validate(taskIdParamSchema), taskController.listComments);

export default router;
