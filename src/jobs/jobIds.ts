export function assignmentNotificationJobId(assignmentId: string): string {
  return `assignment-email-${assignmentId}`;
}

export function deadLetterJobId(originalJobId: string): string {
  return `dlq-${originalJobId}`;
}
