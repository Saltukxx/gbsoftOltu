import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testConnection() {
  console.log('🔍 Testing database connection...');
  console.log('DATABASE_URL:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@') || 'NOT SET');
  console.log('DIRECT_URL:', process.env.DIRECT_URL?.replace(/:[^:@]+@/, ':****@') || 'NOT SET');
  console.log('');

  try {
    // Test basic connection
    await prisma.$connect();
    console.log('✅ Successfully connected to database!');

    // Test a simple query
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Database query test passed:', result);

    // Check if users table exists
    const tableExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `;
    console.log('✅ Users table exists:', tableExists);

    // Check Prisma migrations
    const migrations = await prisma.$queryRaw`
      SELECT * FROM "_prisma_migrations" 
      ORDER BY finished_at DESC 
      LIMIT 5;
    `;
    console.log('✅ Recent migrations:', migrations);

  } catch (error: any) {
    console.error('❌ Connection failed!');
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    
    if (error.code === 'P1001') {
      console.error('');
      console.error('💡 Possible solutions:');
      console.error('1. Check if your Supabase database is paused (most common)');
      console.error('   → Go to https://app.supabase.com and restore your database');
      console.error('2. Verify your DATABASE_URL in .env file');
      console.error('3. Check your network/firewall settings');
      console.error('4. Ensure you\'re using the correct port (5432 for direct, 6543 for pooler)');
    }
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();

