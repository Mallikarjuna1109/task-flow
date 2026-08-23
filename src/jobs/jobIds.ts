// Pure, side-effect-free (no Redis import) so unit tests can use the real
// job id convention without opening a live Redis connection.

// IMPORTANT: never use ':' in a BullMQ custom jobId. BullMQ rejects any
// jobId containing ':' unless it splits into exactly 3 parts (its own
// legacy repeatable-job key format) - "assignment-email:<uuid>" split into
// 2 parts and always threw "Custom Id cannot contain :". Use '-' instead.
export function assignmentNotificationJobId(assignmentId: string): string {
  return `assignment-email-${assignmentId}`;
}

export function deadLetterJobId(originalJobId: string): string {
  return `dlq-${originalJobId}`;
}
