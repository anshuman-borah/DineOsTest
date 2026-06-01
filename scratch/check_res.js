const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/dineos',
  });
  await client.connect();
  const res = await client.query(`
    SELECT id, status, booking_ref, num_adults, total_amount
    FROM hotel_reservations
    WHERE booking_ref = 'MMT-998877'
  `);
  console.log(res.rows);
  await client.end();
}
check().catch(console.error);
