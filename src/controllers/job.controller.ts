import { Request, Response } from 'express';
import { jobService } from '../services/job.service';
import { asyncHandler } from '../utils/asyncHandler';

export const jobController = {
  get: asyncHandler(async (req: Request, res: Response) => {
    const job = await jobService.getJobStatus(req.auth!, req.params.id);
    res.status(200).json(job);
  }),
};
