import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Expected credentials
const expectedCredentials = [
  { email: 'president@oltubelediyesi.gov.tr', password: 'president123', name: 'President' },
  { email: 'admin@oltubelediyesi.gov.tr', password: 'admin123', name: 'Admin' },
  { email: 'supervisor@oltubelediyesi.gov.tr', password: 'supervisor123', name: 'Supervisor' },
  { email: 'ahmet.yilmaz@oltubelediyesi.gov.tr', password: 'operator123', name: 'Operator 1' },
  { email: 'fatma.kaya@oltubelediyesi.gov.tr', password: 'operator123', name: 'Operator 2' },
  { email: 'messenger@oltubelediyesi.gov.tr', password: 'messenger123', name: 'Messenger' },
];

async function verifyAndFixPasswords() {
  try {
    console.log('🔍 Verifying and fixing user passwords...\n');

    for (const cred of expectedCredentials) {
      const user = await prisma.user.findUnique({
        where: { email: cred.email },
        select: { id: true, email: true, password: true, firstName: true, lastName: true },
      });

      if (!user) {
        console.log(`❌ User not found: ${cred.email}`);
        continue;
      }

      // Test if password matches
      const isValid = await bcrypt.compare(cred.password, user.password);
      
      if (isValid) {
        console.log(`✅ ${cred.name} (${cred.email}): Password is correct`);
      } else {
        console.log(`⚠️  ${cred.name} (${cred.email}): Password mismatch - fixing...`);
        
        // Re-hash and update password
        const hashedPassword = await bcrypt.hash(cred.password, 10);
        await prisma.user.update({
          where: { id: user.id },
          data: { password: hashedPassword },
        });
        
        console.log(`   ✅ Password updated successfully`);
      }
    }

    // Check additional users
    console.log('\n🔍 Checking additional users...');
    const additionalUsers = await prisma.user.findMany({
      where: {
        email: {
          notIn: expectedCredentials.map(c => c.email),
        },
        isActive: true,
      },
      select: { email: true, firstName: true, lastName: true },
    });

    console.log(`Found ${additionalUsers.length} additional users`);
    for (const user of additionalUsers) {
      // Test with common password
      const userRecord = await prisma.user.findUnique({
        where: { email: user.email },
        select: { password: true },
      });
      
      if (userRecord) {
        const isValid = await bcrypt.compare('user123', userRecord.password);
        if (isValid) {
          console.log(`✅ ${user.firstName} ${user.lastName} (${user.email}): Password is correct`);
        } else {
          console.log(`⚠️  ${user.firstName} ${user.lastName} (${user.email}): Password mismatch - fixing...`);
          const hashedPassword = await bcrypt.hash('user123', 10);
          await prisma.user.update({
            where: { email: user.email },
            data: { password: hashedPassword },
          });
          console.log(`   ✅ Password updated successfully`);
        }
      }
    }

    console.log('\n✅ Password verification and fix completed!');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

verifyAndFixPasswords();

