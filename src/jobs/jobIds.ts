// Pure, side-effect-free job id helpers - deliberately kept in their own
// module (no import of ../config/redis or bullmq's `Queue`) so unit tests
// can exercise the REAL job id convention without opening a live Redis
// connection. jobs/queues.ts re-exports this for existing call sites.

/**
 * Deterministic job id so a duplicate assignment call within a short window
 * naturally collapses into one job (bonus: dedupe within 5s - paired with
 * the DB-level check in assignment.service).
 *
 * Uses a hyphen, NOT a colon, as the separator. BullMQ's Job.addJob rejects
 * any custom jobId that contains ':' unless splitting it by ':' yields
 * *exactly* 3 parts (a legacy compatibility rule for its own internal
 * repeatable-job key format - see node_modules/bullmq/dist/cjs/classes/job.js,
 * "Custom Id cannot contain :"). `assignment-email:<uuid>` splits into only
 * 2 parts and always threw. assignmentId is a UUID (hyphens only, never a
 * colon), so this id contains zero colons and never trips that check.
 */
export function assignmentNotificationJobId(assignmentId: string): string {
  return `assignment-email-${assignmentId}`;
}

/**
 * Dead-letter job id, derived from the original job's id. Same colon
 * constraint applies here - see assignmentNotificationJobId above.
 */
export function deadLetterJobId(originalJobId: string): string {
  return `dlq-${originalJobId}`;
}
