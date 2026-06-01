const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/dineos',
  });
  await client.connect();
  const res = await client.query(`
    SELECT r.id, r.room_number, r.status, rt.name 
    FROM hotel_rooms r
    JOIN hotel_room_types rt ON r.room_type_id = rt.id
    WHERE rt.channel_manager_id = 'OTA_DELUXE_ROOM '
  `);
  console.log(res.rows);
  await client.end();
}
check().catch(console.error);
