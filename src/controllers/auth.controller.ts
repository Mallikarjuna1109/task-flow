import { Request, Response } from 'express';
import { authService } from '../services/auth.service';
import { asyncHandler } from '../utils/asyncHandler';
import { LoginInput, RegisterInput } from '../validators/auth.validator';

function requestMeta(req: Request) {
  return { userAgent: req.headers['user-agent'] ?? null, ipAddress: req.ip ?? null };
}

export const authController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as RegisterInput;
    const { user, tokens } = await authService.register(input, requestMeta(req));
    res.status(201).json({ user, ...tokens });
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as LoginInput;
    const { user, tokens } = await authService.login(input.email, input.password, requestMeta(req));
    res.status(200).json({ user, ...tokens });
  }),

  refresh: asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body as { refreshToken: string };
    const { user, tokens } = await authService.refresh(refreshToken, requestMeta(req));
    res.status(200).json({ user, ...tokens });
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken, allDevices } = req.body as { refreshToken: string; allDevices?: boolean };
    await authService.logout(refreshToken, Boolean(allDevices));
    res.status(204).send();
  }),
};
