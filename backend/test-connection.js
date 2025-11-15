const { Client } = require('pg');

const client = new Client({
  host: '127.0.0.1',
  port: 5432,
  database: 'oltu_platform',
  user: 'postgres',
  password: 'postgres',
});

client.connect()
  .then(() => {
    console.log('✅ Connected successfully!');
    return client.query('SELECT version()');
  })
  .then((result) => {
    console.log('Database version:', result.rows[0].version);
    client.end();
  })
  .catch((err) => {
    console.error('❌ Connection error:', err.message);
    process.exit(1);
  });

