import { PrismaClient, Role, TaskPriority, TaskStatus } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const SALT_ROUNDS = 12;

async function hash(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function main() {
  console.log('Seeding database...');

  const acme = await prisma.organization.upsert({
    where: { slug: 'acme-corp' },
    update: {},
    create: { name: 'Acme Corp', slug: 'acme-corp' },
  });

  const globex = await prisma.organization.upsert({
    where: { slug: 'globex-inc' },
    update: {},
    create: { name: 'Globex Inc', slug: 'globex-inc' },
  });

  const passwordHash = await hash('Password123!');

  const alice = await prisma.user.upsert({
    where: { email: 'alice@acme.test' },
    update: {},
    create: { email: 'alice@acme.test', name: 'Alice Anderson', passwordHash },
  });
  const bob = await prisma.user.upsert({
    where: { email: 'bob@acme.test' },
    update: {},
    create: { email: 'bob@acme.test', name: 'Bob Brown', passwordHash },
  });
  const carol = await prisma.user.upsert({
    where: { email: 'carol@acme.test' },
    update: {},
    create: { email: 'carol@acme.test', name: 'Carol Chen', passwordHash },
  });
  const dave = await prisma.user.upsert({
    where: { email: 'dave@globex.test' },
    update: {},
    create: { email: 'dave@globex.test', name: 'Dave Davis', passwordHash },
  });
  const erin = await prisma.user.upsert({
    where: { email: 'erin@globex.test' },
    update: {},
    create: { email: 'erin@globex.test', name: 'Erin Evans', passwordHash },
  });

  const memberships: Array<[string, string, Role]> = [
    [acme.id, alice.id, Role.org_admin],
    [acme.id, bob.id, Role.member],
    [acme.id, carol.id, Role.member],
    [globex.id, dave.id, Role.org_admin],
    [globex.id, erin.id, Role.member],
  ];
  for (const [orgId, userId, role] of memberships) {
    await prisma.orgMember.upsert({
      where: { orgId_userId: { orgId, userId } },
      update: { role },
      create: { orgId, userId, role },
    });
  }

  const websiteRevamp = await prisma.project.create({
    data: {
      orgId: acme.id,
      name: 'Website Revamp',
      description: 'Redesign the marketing site and migrate to the new CMS.',
      createdById: alice.id,
    },
  });
  const mobileApp = await prisma.project.create({
    data: {
      orgId: acme.id,
      name: 'Mobile App Launch',
      description: 'Ship v1 of the Acme companion mobile app.',
      createdById: alice.id,
    },
  });
  const infraMigration = await prisma.project.create({
    data: {
      orgId: globex.id,
      name: 'Cloud Infra Migration',
      description: 'Migrate on-prem workloads to the cloud.',
      createdById: dave.id,
    },
  });

  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  const taskDefs = [
    { project: websiteRevamp, title: 'Set up design system tokens', description: 'Define color, spacing and typography tokens for the new site.', status: TaskStatus.done, priority: TaskPriority.medium, dueDate: new Date(now - 10 * dayMs), createdBy: alice },
    { project: websiteRevamp, title: 'Build homepage hero section', description: 'Implement the new hero section per Figma spec.', status: TaskStatus.in_progress, priority: TaskPriority.high, dueDate: new Date(now + 3 * dayMs), createdBy: alice },
    { project: websiteRevamp, title: 'Migrate blog content to new CMS', description: 'Export existing posts and import them into the new headless CMS.', status: TaskStatus.todo, priority: TaskPriority.medium, dueDate: new Date(now + 10 * dayMs), createdBy: alice },
    { project: websiteRevamp, title: 'Fix broken checkout links', description: 'Several product pages link to a 404 checkout URL in staging.', status: TaskStatus.review, priority: TaskPriority.urgent, dueDate: new Date(now + 1 * dayMs), createdBy: bob },
    { project: websiteRevamp, title: 'Accessibility audit', description: 'Run an automated + manual a11y pass on the new templates.', status: TaskStatus.todo, priority: TaskPriority.low, dueDate: new Date(now + 20 * dayMs), createdBy: carol },
    { project: mobileApp, title: 'Implement push notifications', description: 'Wire up FCM/APNs for task assignment alerts.', status: TaskStatus.in_progress, priority: TaskPriority.high, dueDate: new Date(now + 5 * dayMs), createdBy: alice },
    { project: mobileApp, title: 'Offline task caching', description: 'Cache the task list locally for offline viewing.', status: TaskStatus.todo, priority: TaskPriority.medium, dueDate: new Date(now + 15 * dayMs), createdBy: bob },
    { project: mobileApp, title: 'App store submission', description: 'Prepare screenshots, metadata and submit for review.', status: TaskStatus.todo, priority: TaskPriority.urgent, dueDate: new Date(now + 2 * dayMs), createdBy: alice },
    { project: mobileApp, title: 'Crash reporting integration', description: 'Add Sentry crash reporting to the mobile client.', status: TaskStatus.done, priority: TaskPriority.low, dueDate: new Date(now - 5 * dayMs), createdBy: carol },
    { project: infraMigration, title: 'Provision VPC and subnets', description: 'Set up networking for the new cloud environment.', status: TaskStatus.done, priority: TaskPriority.high, dueDate: new Date(now - 7 * dayMs), createdBy: dave },
    { project: infraMigration, title: 'Migrate primary database', description: 'Cut over the primary Postgres instance with minimal downtime.', status: TaskStatus.in_progress, priority: TaskPriority.urgent, dueDate: new Date(now + 4 * dayMs), createdBy: dave },
    { project: infraMigration, title: 'Decommission legacy servers', description: 'Tear down on-prem servers once migration is verified.', status: TaskStatus.todo, priority: TaskPriority.medium, dueDate: new Date(now + 30 * dayMs), createdBy: erin },
  ];

  const tasks = [];
  for (const def of taskDefs) {
    const task = await prisma.task.create({
      data: {
        projectId: def.project.id,
        title: def.title,
        description: def.description,
        status: def.status,
        priority: def.priority,
        dueDate: def.dueDate,
        createdById: def.createdBy.id,
      },
    });
    tasks.push(task);
  }

  const assignmentDefs: Array<[typeof tasks[number], { id: string }, { id: string }]> = [
    [tasks[1], bob, alice],
    [tasks[2], carol, alice],
    [tasks[3], bob, alice],
    [tasks[5], bob, alice],
    [tasks[7], carol, alice],
    [tasks[10], erin, dave],
    [tasks[11], erin, dave],
  ];
  for (const [task, assignee, assignedBy] of assignmentDefs) {
    await prisma.taskAssignment.upsert({
      where: { taskId_userId: { taskId: task.id, userId: assignee.id } },
      update: {},
      create: { taskId: task.id, userId: assignee.id, assignedById: assignedBy.id, notificationStatus: 'queued' },
    });
  }

  await prisma.comment.createMany({
    data: [
      { taskId: tasks[1].id, authorId: alice.id, body: 'Please match the spacing from the Figma file exactly.' },
      { taskId: tasks[1].id, authorId: bob.id, body: 'Working on it, should be done by EOD tomorrow.' },
      { taskId: tasks[3].id, authorId: bob.id, body: 'Found the root cause - stale CDN cache on the checkout route.' },
      { taskId: tasks[10].id, authorId: dave.id, body: 'Scheduling the cutover for the next maintenance window.' },
      { taskId: tasks[10].id, authorId: erin.id, body: 'Runbook is ready, linked in the project wiki.' },
    ],
  });

  console.log('Seed complete:');
  console.log(`  Organizations: acme-corp, globex-inc`);
  console.log(`  Users (password for all: Password123!):`);
  console.log(`    alice@acme.test (org_admin, Acme Corp)`);
  console.log(`    bob@acme.test (member, Acme Corp)`);
  console.log(`    carol@acme.test (member, Acme Corp)`);
  console.log(`    dave@globex.test (org_admin, Globex Inc)`);
  console.log(`    erin@globex.test (member, Globex Inc)`);
  console.log(`  Projects: ${websiteRevamp.name}, ${mobileApp.name}, ${infraMigration.name}`);
  console.log(`  Tasks created: ${tasks.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
