import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3001';

async function testManualLogin() {
  console.log('🧪 Testing manual login flow...\n');
  console.log(`📡 API URL: ${API_URL}\n`);

  const testCredentials = [
    { email: 'president@oltubelediyesi.gov.tr', password: 'president123', name: 'President' },
    { email: 'admin@oltubelediyesi.gov.tr', password: 'admin123', name: 'Admin' },
  ];

  for (const cred of testCredentials) {
    console.log(`\n🔐 Testing: ${cred.name}`);
    console.log(`   Email: ${cred.email}`);
    console.log(`   Password: ${cred.password}`);

    try {
      const response = await axios.post(
        `${API_URL}/api/auth/login`,
        {
          email: cred.email,
          password: cred.password,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          withCredentials: true,
          timeout: 10000,
          validateStatus: (status) => status < 500,
        }
      );

      console.log(`   Status: ${response.status}`);
      console.log(`   Response:`, JSON.stringify(response.data, null, 2));

      if (response.status === 200 && response.data.success) {
        console.log(`   ✅ SUCCESS`);
        console.log(`   Access Token: ${response.data.accessToken?.substring(0, 20)}...`);
        console.log(`   User: ${response.data.user?.firstName} ${response.data.user?.lastName} (${response.data.user?.role})`);
      } else {
        console.log(`   ❌ FAILED`);
        console.log(`   Error: ${response.data.error || response.data.message || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.log(`   ❌ ERROR`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Data:`, JSON.stringify(error.response.data, null, 2));
        console.log(`   Headers:`, JSON.stringify(error.response.headers, null, 2));
      } else if (error.request) {
        console.log(`   No response received`);
        console.log(`   Request:`, error.request);
      } else {
        console.log(`   Error:`, error.message);
      }
    }

    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

testManualLogin()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });

