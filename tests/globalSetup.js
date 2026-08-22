// Jest global setup (runs once, in a separate process, before any test file).
//
// Applies pending Prisma migrations to the dedicated test database
// (DATABASE_URL_TEST) so integration tests start from a known schema. This
// is best-effort: if no test database is reachable (e.g. someone is only
// running the pure unit tests, which need no DB at all) we warn instead of
// hard-failing the whole run - the integration tests themselves will fail
// individually with a clear connection error if the DB truly isn't available.
const { execSync } = require('child_process');
require('dotenv').config();

module.exports = async () => {
  const testDbUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
  if (!testDbUrl) {
    console.warn('[globalSetup] No DATABASE_URL_TEST/DATABASE_URL set - skipping migration step.');
    return;
  }

  try {
    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: testDbUrl },
      stdio: 'inherit',
    });
  } catch (err) {
    console.warn('[globalSetup] Could not apply migrations to the test database. Integration tests will fail until it is reachable.');
    console.warn(String(err && err.message ? err.message : err));
  }
};
