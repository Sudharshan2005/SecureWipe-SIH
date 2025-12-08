const axios = require('axios');

const AUTH_API_URL = 'http://localhost:5001';

// Test data
const testUsers = [
  {
    username: 'john_individual',
    password: 'test123',
    role: 'individual'
  },
  {
    username: 'jane_ceo',
    password: 'test123',
    role: 'organization-ceo'
  },
  {
    username: 'bob_employee',
    password: 'test123',
    role: 'organization-employee'
  }
];

async function testSignup(user) {
  try {
    console.log(`\n🔹 Testing signup for: ${user.username} (${user.role})`);
    const response = await axios.post(`${AUTH_API_URL}/api/auth/signup`, user);
    console.log('✅ Signup successful!');
    console.log('   Token:', response.data.token.substring(0, 20) + '...');
    console.log('   Session ID:', response.data.sessionId.substring(0, 20) + '...');
    console.log('   User ID:', response.data.user.id);
    console.log('   Username:', response.data.user.username);
    console.log('   Role:', response.data.user.role);
    if (response.data.user.organizationId) {
      console.log('   Organization ID:', response.data.user.organizationId);
    }
    return response.data;
  } catch (error) {
    if (error.response) {
      console.log('❌ Signup failed:', error.response.data.error);
    } else {
      console.log('❌ Signup error:', error.message);
    }
    return null;
  }
}

async function testLogin(username, password) {
  try {
    console.log(`\n🔹 Testing login for: ${username}`);
    const response = await axios.post(`${AUTH_API_URL}/api/auth/login`, {
      username,
      password
    });
    console.log('✅ Login successful!');
    console.log('   Token:', response.data.token.substring(0, 20) + '...');
    console.log('   Session ID:', response.data.sessionId.substring(0, 20) + '...');
    console.log('   User ID:', response.data.user.id);
    console.log('   Username:', response.data.user.username);
    console.log('   Role:', response.data.user.role);
    if (response.data.user.organizationId) {
      console.log('   Organization ID:', response.data.user.organizationId);
    }
    return response.data;
  } catch (error) {
    if (error.response) {
      console.log('❌ Login failed:', error.response.data.error);
    } else {
      console.log('❌ Login error:', error.message);
    }
    return null;
  }
}

async function testSessionValidation(sessionId) {
  try {
    console.log(`\n🔹 Testing session validation`);
    const response = await axios.post(`${AUTH_API_URL}/api/auth/validate-session`, {
      sessionId
    });
    console.log('✅ Session is valid!');
    console.log('   User ID:', response.data.user.id);
    console.log('   Username:', response.data.user.username);
    console.log('   Role:', response.data.user.role);
    return response.data;
  } catch (error) {
    if (error.response) {
      console.log('❌ Session validation failed:', error.response.data.error);
    } else {
      console.log('❌ Session validation error:', error.message);
    }
    return null;
  }
}

async function runTests() {
  console.log('🚀 Starting authentication tests...\n');
  console.log('=' .repeat(60));

  // Test 1: Signup for all user types
  console.log('\n📝 TEST 1: User Signup');
  console.log('=' .repeat(60));
  
  const signupResults = [];
  for (const user of testUsers) {
    const result = await testSignup(user);
    if (result) {
      signupResults.push(result);
    }
    await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between requests
  }

  // Test 2: Login
  console.log('\n\n🔐 TEST 2: User Login');
  console.log('=' .repeat(60));
  
  for (const user of testUsers) {
    const result = await testLogin(user.username, user.password);
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Test 3: Session Validation
  if (signupResults.length > 0) {
    console.log('\n\n✓ TEST 3: Session Validation');
    console.log('=' .repeat(60));
    
    const sessionId = signupResults[0].sessionId;
    await testSessionValidation(sessionId);
  }

  // Test 4: Duplicate username
  console.log('\n\n🔄 TEST 4: Duplicate Username Prevention');
  console.log('=' .repeat(60));
  await testSignup(testUsers[0]); // Should fail

  // Test 5: Invalid credentials
  console.log('\n\n🚫 TEST 5: Invalid Login Credentials');
  console.log('=' .repeat(60));
  await testLogin('john_individual', 'wrongpassword'); // Should fail

  console.log('\n\n' + '=' .repeat(60));
  console.log('✨ All tests completed!');
  console.log('=' .repeat(60));
}

// Run the tests
runTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
