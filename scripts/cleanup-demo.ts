import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function cleanup() {
  await sql`DELETE FROM jobs WHERE id LIKE 'demo%'`;
  console.log('✅ Demo jobs deleted');
}

cleanup().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
