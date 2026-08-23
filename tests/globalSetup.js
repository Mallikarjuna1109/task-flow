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
