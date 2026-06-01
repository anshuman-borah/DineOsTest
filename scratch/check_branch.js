const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/dineos',
  });
  await client.connect();
  const res = await client.query(`
    SELECT id, name, channel_manager_id, branch_id
    FROM hotel_room_types
    WHERE channel_manager_id = 'OTA_DELUXE_ROOM '
  `);
  console.log(res.rows);
  await client.end();
}
check().catch(console.error);
