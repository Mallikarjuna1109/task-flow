process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

// Test isolation: a dedicated test DB (DATABASE_URL_TEST) is truncated before every test.
import { prisma } from '../../src/config/prisma';

const TABLES = [
  'comments',
  'task_assignments',
  'tasks',
  'projects',
  'refresh_tokens',
  'org_members',
  'organizations',
  'users',
];

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await prisma.$disconnect();
});
