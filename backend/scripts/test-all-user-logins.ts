import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Base URL for API
const API_URL = process.env.API_URL || 'http://localhost:3001';

// Password mapping based on seed data
const passwordMap: Record<string, string> = {
  'president@oltubelediyesi.gov.tr': 'president123',
  'admin@oltubelediyesi.gov.tr': 'admin123',
  'supervisor@oltubelediyesi.gov.tr': 'supervisor123',
  'ahmet.yilmaz@oltubelediyesi.gov.tr': 'operator123',
  'fatma.kaya@oltubelediyesi.gov.tr': 'operator123',
  'messenger@oltubelediyesi.gov.tr': 'messenger123',
  // Additional users all use 'user123'
};

interface TestResult {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: 'success' | 'failure' | 'skipped';
  error?: string;
  responseTime?: number;
}

async function testLogin(email: string, password: string): Promise<{ success: boolean; error?: string; responseTime: number }> {
  const startTime = Date.now();
  try {
    const response = await axios.post(
      `${API_URL}/api/auth/login`,
      { email, password },
      {
        timeout: 10000,
        validateStatus: (status) => status < 500, // Don't throw on 4xx errors
      }
    );

    const responseTime = Date.now() - startTime;

    if (response.status === 200 && response.data.success) {
      return { success: true, responseTime };
    } else {
      return {
        success: false,
        error: response.data.error || `HTTP ${response.status}`,
        responseTime,
      };
    }
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    if (error.response) {
      return {
        success: false,
        error: error.response.data?.error || `HTTP ${error.response.status}`,
        responseTime,
      };
    } else if (error.request) {
      return {
        success: false,
        error: 'No response from server (is backend running?)',
        responseTime,
      };
    } else {
      return {
        success: false,
        error: error.message || 'Unknown error',
        responseTime,
      };
    }
  }
}

async function testAllUserLogins() {
  console.log('🧪 Testing login for all users in database...\n');
  console.log(`📡 API URL: ${API_URL}\n`);

  try {
    // Fetch all active users
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
      },
      orderBy: [
        { role: 'asc' },
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
    });

    if (users.length === 0) {
      console.log('❌ No users found in database!');
      return;
    }

    console.log(`Found ${users.length} active users\n`);
    console.log('─'.repeat(100));

    const results: TestResult[] = [];
    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;

    // Test each user
    for (const user of users) {
      // Determine password
      let password = passwordMap[user.email];
      if (!password) {
        // Check if it's one of the additional users (they all use 'user123')
        password = 'user123';
      }

      console.log(`\n🔐 Testing: ${user.firstName} ${user.lastName}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Password: ${password}`);

      const testResult = await testLogin(user.email, password);

      const result: TestResult = {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: testResult.success ? 'success' : 'failure',
        error: testResult.error,
        responseTime: testResult.responseTime,
      };

      if (testResult.success) {
        console.log(`   ✅ SUCCESS (${testResult.responseTime}ms)`);
        successCount++;
      } else {
        console.log(`   ❌ FAILED: ${testResult.error} (${testResult.responseTime}ms)`);
        failureCount++;
      }

      results.push(result);

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Print summary
    console.log('\n' + '═'.repeat(100));
    console.log('📊 TEST SUMMARY');
    console.log('═'.repeat(100));
    console.log(`Total Users Tested: ${users.length}`);
    console.log(`✅ Successful Logins: ${successCount}`);
    console.log(`❌ Failed Logins: ${failureCount}`);
    console.log(`⏭️  Skipped: ${skippedCount}`);

    // Detailed results table
    if (failureCount > 0) {
      console.log('\n' + '─'.repeat(100));
      console.log('❌ FAILED LOGINS:');
      console.log('─'.repeat(100));
      results
        .filter(r => r.status === 'failure')
        .forEach(r => {
          console.log(`\n${r.firstName} ${r.lastName} (${r.email})`);
          console.log(`  Role: ${r.role}`);
          console.log(`  Error: ${r.error}`);
          console.log(`  Response Time: ${r.responseTime}ms`);
        });
    }

    // Success summary by role
    console.log('\n' + '─'.repeat(100));
    console.log('✅ SUCCESS BY ROLE:');
    console.log('─'.repeat(100));
    const roleStats: Record<string, { success: number; total: number }> = {};
    results.forEach(r => {
      if (!roleStats[r.role]) {
        roleStats[r.role] = { success: 0, total: 0 };
      }
      roleStats[r.role].total++;
      if (r.status === 'success') {
        roleStats[r.role].success++;
      }
    });

    Object.entries(roleStats)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([role, stats]) => {
        const percentage = ((stats.success / stats.total) * 100).toFixed(1);
        console.log(`${role.padEnd(15)}: ${stats.success}/${stats.total} (${percentage}%)`);
      });

    // Performance stats
    const avgResponseTime = results
      .filter(r => r.responseTime)
      .reduce((sum, r) => sum + (r.responseTime || 0), 0) / results.length;

    const minResponseTime = Math.min(
      ...results.map(r => r.responseTime || Infinity).filter(t => t !== Infinity)
    );
    const maxResponseTime = Math.max(
      ...results.map(r => r.responseTime || 0).filter(t => t !== 0)
    );

    console.log('\n' + '─'.repeat(100));
    console.log('⏱️  PERFORMANCE STATS:');
    console.log('─'.repeat(100));
    console.log(`Average Response Time: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`Min Response Time: ${minResponseTime}ms`);
    console.log(`Max Response Time: ${maxResponseTime}ms`);

    // Final verdict
    console.log('\n' + '═'.repeat(100));
    if (failureCount === 0) {
      console.log('🎉 ALL TESTS PASSED! All users can log in successfully.');
    } else {
      console.log(`⚠️  ${failureCount} login(s) failed. Please check the errors above.`);
    }
    console.log('═'.repeat(100));

  } catch (error: any) {
    console.error('\n❌ Error running tests:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Run the tests
testAllUserLogins()
  .then(() => {
    console.log('\n✅ Test script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test script failed:', error);
    process.exit(1);
  });

