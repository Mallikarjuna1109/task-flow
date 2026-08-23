import { Request, Response } from 'express';
import { NotificationStatus } from '@prisma/client';
import { taskService } from '../services/task.service';
import { assignmentService } from '../services/assignment.service';
import { asyncHandler } from '../utils/asyncHandler';
import { resolvePagination, buildOffsetPage } from '../utils/pagination';
import { TaskFilters } from '../repositories/task.repository';

export const taskController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const task = await taskService.create(req.auth!, req.params.projectId, req.body);
    res.status(201).json(task);
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const pagination = resolvePagination(req.query);
    const query = req.query as Record<string, unknown>;
    const filters: TaskFilters = {
      status: query.status as TaskFilters['status'],
      priority: query.priority as TaskFilters['priority'],
      assigneeId: query.assigneeId as string | undefined,
      dueBefore: query.dueBefore as Date | undefined,
      dueAfter: query.dueAfter as Date | undefined,
    };
    const { data, total } = await taskService.list(req.auth!, req.params.projectId, filters, pagination);
    res.status(200).json(buildOffsetPage(data, total, pagination));
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const task = await taskService.getOrThrow(req.auth!, req.params.projectId, req.params.taskId);
    res.status(200).json(task);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const task = await taskService.update(req.auth!, req.params.projectId, req.params.taskId, req.body);
    res.status(200).json(task);
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await taskService.remove(req.auth!, req.params.projectId, req.params.taskId);
    res.status(204).send();
  }),

  bulkUpdateStatus: asyncHandler(async (req: Request, res: Response) => {
    const result = await taskService.bulkUpdateStatus(req.auth!, req.params.projectId, req.body.taskIds, req.body.status);
    res.status(200).json(result);
  }),

  search: asyncHandler(async (req: Request, res: Response) => {
    const pagination = resolvePagination(req.query);
    const results = await taskService.search(req.auth!, req.query.q as string, pagination);
    res.status(200).json({ data: results });
  }),

  assign: asyncHandler(async (req: Request, res: Response) => {
    const assignment = await assignmentService.assign(req.auth!, req.params.projectId, req.params.taskId, req.body.userId);
    const statusCode = assignment.notificationStatus === NotificationStatus.queued ? 201 : 202;
    res.status(statusCode).json(assignment);
  }),

  unassign: asyncHandler(async (req: Request, res: Response) => {
    await assignmentService.unassign(req.auth!, req.params.projectId, req.params.taskId, req.params.userId);
    res.status(204).send();
  }),

  addComment: asyncHandler(async (req: Request, res: Response) => {
    const comment = await taskService.addComment(req.auth!, req.params.projectId, req.params.taskId, req.body.body);
    res.status(201).json(comment);
  }),

  listComments: asyncHandler(async (req: Request, res: Response) => {
    const comments = await taskService.listComments(req.auth!, req.params.projectId, req.params.taskId);
    res.status(200).json({ data: comments });
  }),
};
