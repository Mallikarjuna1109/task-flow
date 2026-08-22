import { Request, Response } from 'express';
import { orgService } from '../services/org.service';
import { asyncHandler } from '../utils/asyncHandler';

export const orgController = {
  listMembers: asyncHandler(async (req: Request, res: Response) => {
    const members = await orgService.listMembers(req.auth!);
    res.status(200).json({ data: members });
  }),

  addMember: asyncHandler(async (req: Request, res: Response) => {
    const member = await orgService.addMember(req.auth!, req.body.email, req.body.role);
    res.status(201).json(member);
  }),

  updateMemberRole: asyncHandler(async (req: Request, res: Response) => {
    const member = await orgService.updateMemberRole(req.auth!, req.params.userId, req.body.role);
    res.status(200).json(member);
  }),

  removeMember: asyncHandler(async (req: Request, res: Response) => {
    await orgService.removeMember(req.auth!, req.params.userId);
    res.status(204).send();
  }),
};
