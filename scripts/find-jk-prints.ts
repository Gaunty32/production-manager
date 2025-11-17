import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function findJKPrints() {
  const result = await sql`SELECT id, name FROM customers WHERE name = 'JK Prints'`;
  console.log('JK Prints customer:', result);
}

findJKPrints().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
