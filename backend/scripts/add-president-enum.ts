import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addPresidentEnum() {
  try {
    console.log('Adding PRESIDENT value to UserRole enum...');
    
    // Execute raw SQL to add PRESIDENT to enum
    await prisma.$executeRawUnsafe(`
      DO $$ 
      BEGIN
          IF NOT EXISTS (
              SELECT 1 FROM pg_enum 
              WHERE enumlabel = 'PRESIDENT' 
              AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'UserRole')
          ) THEN
              ALTER TYPE "UserRole" ADD VALUE 'PRESIDENT';
              RAISE NOTICE 'PRESIDENT value added to UserRole enum';
          ELSE
              RAISE NOTICE 'PRESIDENT value already exists in UserRole enum';
          END IF;
      END $$;
    `);
    
    console.log('✅ PRESIDENT enum value added successfully!');
  } catch (error: any) {
    console.error('❌ Error adding PRESIDENT enum:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

addPresidentEnum();

