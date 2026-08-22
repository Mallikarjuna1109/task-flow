import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { validate } from '../middleware/validate.middleware';
import { authRateLimiter } from '../middleware/rateLimit.middleware';
import { loginSchema, logoutSchema, refreshSchema, registerSchema } from '../validators/auth.validator';

// Full request/response schemas for these endpoints are documented in
// docs/openapi.json (served at /docs) - kept as the single source of truth
// rather than duplicated here via JSDoc, so Swagger UI can never drift from
// what's actually implemented below.
const router = Router();

router.post('/register', authRateLimiter, validate(registerSchema), authController.register);
router.post('/login', authRateLimiter, validate(loginSchema), authController.login);
router.post('/refresh', authRateLimiter, validate(refreshSchema), authController.refresh);
router.post('/logout', authRateLimiter, validate(logoutSchema), authController.logout);

export default router;
