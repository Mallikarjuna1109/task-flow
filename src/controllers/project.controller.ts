import { Request, Response } from 'express';
import { projectService } from '../services/project.service';
import { asyncHandler } from '../utils/asyncHandler';
import { resolvePagination, buildOffsetPage } from '../utils/pagination';

export const projectController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const project = await projectService.create(req.auth!, req.body);
    res.status(201).json(project);
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const pagination = resolvePagination(req.query);
    const { data, total } = await projectService.list(req.auth!, pagination);
    res.status(200).json(buildOffsetPage(data, total, pagination));
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const project = await projectService.getOrThrow(req.auth!, req.params.projectId);
    res.status(200).json(project);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const project = await projectService.update(req.auth!, req.params.projectId, req.body);
    res.status(200).json(project);
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await projectService.remove(req.auth!, req.params.projectId);
    res.status(204).send();
  }),

  dashboard: asyncHandler(async (req: Request, res: Response) => {
    const dashboard = await projectService.dashboard(req.auth!, req.params.projectId);
    res.status(200).json(dashboard);
  }),
};
