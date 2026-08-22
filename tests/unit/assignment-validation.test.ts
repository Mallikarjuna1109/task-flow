import { Role } from '@prisma/client';
import { AuthContext } from '../../src/types';

jest.mock('../../src/config/prisma', () => ({
  prisma: { $transaction: jest.fn((fn: any) => fn({})) },
}));
jest.mock('../../src/repositories/task.repository');
jest.mock('../../src/repositories/assignment.repository');
jest.mock('../../src/repositories/org.repository');
jest.mock('../../src/repositories/user.repository');
jest.mock('../../src/jobs/queues', () => ({
  emailQueue: { add: jest.fn().mockResolvedValue({ id: 'job-1' }) },
  assignmentNotificationJobId: (id: string) => `assignment-email:${id}`,
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

  it('creates the assignment and enqueues a notification job when validation passes', async () => {
    (orgRepository.isUserInOrg as jest.Mock).mockResolvedValue(true);
    (assignmentRepository.findActive as jest.Mock).mockResolvedValue(null);
    (assignmentRepository.create as jest.Mock).mockResolvedValue({ id: 'assignment-1', taskId: 'task-1', userId: 'user-2' });

    const result = await assignmentService.assign(auth, 'project-1', 'task-1', 'user-2');

    expect(result).toMatchObject({ id: 'assignment-1' });
    expect(assignmentRepository.create).toHaveBeenCalledWith(
      { taskId: 'task-1', userId: 'user-2', assignedById: 'admin-1' },
      expect.anything(),
    );
    expect(emailQueue.add).toHaveBeenCalledTimes(1);
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
