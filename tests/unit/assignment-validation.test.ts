import { Role } from '@prisma/client';
import { AuthContext } from '../../src/types';

jest.mock('../../src/config/prisma', () => ({
  prisma: { $transaction: jest.fn((fn: any) => fn({})) },
}));
jest.mock('../../src/repositories/task.repository');
jest.mock('../../src/repositories/assignment.repository');
jest.mock('../../src/repositories/org.repository');
jest.mock('../../src/repositories/user.repository');
// `jobs/jobIds.ts` is a pure module (no Redis/BullMQ imports), so it's safe
// to use its REAL implementation here rather than mocking it - this unit
// test exercises the actual job id convention without opening a live Redis
// connection (which `jobs/queues.ts` would do as a module-load side effect).
// Regression coverage for the "Custom Id cannot contain :" BullMQ bug: a
// colon-containing id that doesn't split into exactly 3 parts is rejected -
// see jobs/jobIds.ts for the full explanation.
import { assignmentNotificationJobId } from '../../src/jobs/jobIds';

jest.mock('../../src/jobs/queues', () => ({
  emailQueue: { add: jest.fn().mockResolvedValue({ id: 'assignment-email-assignment-1' }) },
  assignmentNotificationJobId: (id: string) =>
    jest.requireActual('../../src/jobs/jobIds').assignmentNotificationJobId(id),
}));

import { assignmentService } from '../../src/services/assignment.service';
import { taskRepository } from '../../src/repositories/task.repository';
import { assignmentRepository } from '../../src/repositories/assignment.repository';
import { orgRepository } from '../../src/repositories/org.repository';
import { userRepository } from '../../src/repositories/user.repository';
import { emailQueue } from '../../src/jobs/queues';

const auth: AuthContext = { userId: 'admin-1', email: 'admin@acme.test', orgId: 'org-acme', role: Role.org_admin };

const task = { id: 'task-1', projectId: 'project-1', title: 'Ship it', description: null };
const assignee = { id: 'user-2', email: 'bob@acme.test', name: 'Bob' };

beforeEach(() => {
  jest.clearAllMocks();
  (taskRepository.findRawById as jest.Mock).mockResolvedValue(task);
  (taskRepository.findByIdUnscoped as jest.Mock).mockResolvedValue(null);
  (userRepository.findById as jest.Mock).mockResolvedValue(assignee);
  (assignmentRepository.updateNotificationStatus as jest.Mock).mockResolvedValue({});
});

describe('assignmentNotificationJobId', () => {
  it('never produces an id containing a colon (BullMQ rejects colon-ids that do not split into exactly 3 parts)', () => {
    const id = assignmentNotificationJobId('3f0fc81e-7cd5-4a85-ad5c-1143b87b07c5');
    expect(id).not.toContain(':');
    expect(id).toBe('assignment-email-3f0fc81e-7cd5-4a85-ad5c-1143b87b07c5');
  });
});

describe('assignmentService.assign - validation rules', () => {
  it('rejects assigning a user who does not belong to the task organization', async () => {
    (orgRepository.isUserInOrg as jest.Mock).mockResolvedValue(false);

    await expect(assignmentService.assign(auth, 'project-1', 'task-1', 'user-2')).rejects.toMatchObject({
      code: 'USER_NOT_IN_ORGANIZATION',
      statusCode: 400,
    });

    expect(assignmentRepository.create).not.toHaveBeenCalled();
    expect(emailQueue.add).not.toHaveBeenCalled();
  });

  it('returns 404 when the task does not exist anywhere', async () => {
    (taskRepository.findRawById as jest.Mock).mockResolvedValue(null);
    (taskRepository.findByIdUnscoped as jest.Mock).mockResolvedValue(null);

    await expect(assignmentService.assign(auth, 'project-1', 'task-1', 'user-2')).rejects.toMatchObject({
      code: 'TASK_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('returns 403 (not 404) when the task exists but belongs to another organization', async () => {
    (taskRepository.findRawById as jest.Mock).mockResolvedValue(null);
    (taskRepository.findByIdUnscoped as jest.Mock).mockResolvedValue({ id: 'task-1' });

    await expect(assignmentService.assign(auth, 'project-1', 'task-1', 'user-2')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403,
    });
  });

  it('creates the assignment, enqueues a notification job with a valid (colon-free) jobId, and returns the post-enqueue state', async () => {
    (orgRepository.isUserInOrg as jest.Mock).mockResolvedValue(true);
    (assignmentRepository.findActive as jest.Mock).mockResolvedValue(null);
    (assignmentRepository.create as jest.Mock).mockResolvedValue({
      id: 'assignment-1',
      taskId: 'task-1',
      userId: 'user-2',
      notificationStatus: 'pending',
      notificationJobId: null,
    });
    // Simulates the DB row as it looks *after* the enqueue succeeded - this
    // is what the service must return instead of the stale pending snapshot.
    (assignmentRepository.updateNotificationStatus as jest.Mock).mockResolvedValue({
      id: 'assignment-1',
      taskId: 'task-1',
      userId: 'user-2',
      notificationStatus: 'queued',
      notificationJobId: 'assignment-email-assignment-1',
    });

    const result = await assignmentService.assign(auth, 'project-1', 'task-1', 'user-2');

    expect(assignmentRepository.create).toHaveBeenCalledWith(
      { taskId: 'task-1', userId: 'user-2', assignedById: 'admin-1' },
      expect.anything(),
    );

    // The jobId actually handed to BullMQ must be the real, colon-free
    // convention (not a hardcoded/mocked string).
    expect(emailQueue.add).toHaveBeenCalledTimes(1);
    const [, , jobOptions] = (emailQueue.add as jest.Mock).mock.calls[0];
    expect(jobOptions.jobId).toBe('assignment-email-assignment-1');
    expect(jobOptions.jobId).not.toContain(':');

    // The returned assignment must reflect the post-enqueue state, not the
    // pre-enqueue "pending"/null snapshot.
    expect(result).toMatchObject({
      id: 'assignment-1',
      notificationStatus: 'queued',
      notificationJobId: 'assignment-email-assignment-1',
    });
  });

  it('falls back to the pre-enqueue assignment if enqueueing AND the failure bookkeeping update both fail', async () => {
    (orgRepository.isUserInOrg as jest.Mock).mockResolvedValue(true);
    (assignmentRepository.findActive as jest.Mock).mockResolvedValue(null);
    (assignmentRepository.create as jest.Mock).mockResolvedValue({
      id: 'assignment-1',
      taskId: 'task-1',
      userId: 'user-2',
      notificationStatus: 'pending',
      notificationJobId: null,
    });
    (emailQueue.add as jest.Mock).mockRejectedValue(new Error('redis unreachable'));
    (assignmentRepository.updateNotificationStatus as jest.Mock).mockRejectedValue(new Error('db unreachable'));

    // The assignment itself must still succeed (never throw) even though
    // both the enqueue and the failure-tracking update failed.
    const result = await assignmentService.assign(auth, 'project-1', 'task-1', 'user-2');
    expect(result).toMatchObject({ id: 'assignment-1', notificationStatus: 'pending' });
  });

  it('deduplicates a repeat assignment made within 5 seconds (no new job, no error)', async () => {
    (orgRepository.isUserInOrg as jest.Mock).mockResolvedValue(true);
    (assignmentRepository.findActive as jest.Mock).mockResolvedValue({
      id: 'assignment-1',
      taskId: 'task-1',
      userId: 'user-2',
      createdAt: new Date(),
    });

    const result = await assignmentService.assign(auth, 'project-1', 'task-1', 'user-2');

    expect(result).toMatchObject({ id: 'assignment-1' });
    expect(assignmentRepository.create).not.toHaveBeenCalled();
    expect(emailQueue.add).not.toHaveBeenCalled();
  });

  it('rejects re-assigning an already-assigned user outside the 5s dedupe window', async () => {
    (orgRepository.isUserInOrg as jest.Mock).mockResolvedValue(true);
    (assignmentRepository.findActive as jest.Mock).mockResolvedValue({
      id: 'assignment-1',
      taskId: 'task-1',
      userId: 'user-2',
      createdAt: new Date(Date.now() - 60_000),
    });

    await expect(assignmentService.assign(auth, 'project-1', 'task-1', 'user-2')).rejects.toMatchObject({
      code: 'TASK_ALREADY_ASSIGNED',
      statusCode: 409,
    });
  });
});
