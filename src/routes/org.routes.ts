import { Router } from 'express';
import { orgController } from '../controllers/org.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { addMemberSchema, memberIdParamSchema, updateMemberRoleSchema } from '../validators/org.validator';

const router = Router();

router.use(authenticate);

router.get('/members', orgController.listMembers);
router.post('/members', validate(addMemberSchema), orgController.addMember);
router.patch('/members/:userId', validate(updateMemberRoleSchema), orgController.updateMemberRole);
router.delete('/members/:userId', validate(memberIdParamSchema), orgController.removeMember);

export default router;
