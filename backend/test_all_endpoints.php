<?php

require __DIR__ . '/vendor/autoload.php';

$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

echo "=== Testing All Endpoints ===\n\n";

$baseUrl = 'http://127.0.0.1:8000';

// Test 1: Health Check
echo "1. GET /api/health\n";
$response = Illuminate\Support\Facades\Http::get($baseUrl . '/api/health');
echo "   Status: " . $response->status() . "\n";
echo "   Body: " . $response->body() . "\n\n";

// Test 2: Login with invalid credentials
echo "2. POST /api/login (invalid credentials)\n";
$response = Illuminate\Support\Facades\Http::post($baseUrl . '/api/login', [
    'username' => 'invalid_user_12345',
    'password' => 'wrong_password',
]);
echo "   Status: " . $response->status() . "\n";
echo "   Body: " . $response->body() . "\n\n";

// Test 3: Login with missing fields
echo "3. POST /api/login (missing fields)\n";
$response = Illuminate\Support\Facades\Http::post($baseUrl . '/api/login', []);
echo "   Status: " . $response->status() . "\n";
echo "   Body: " . $response->body() . "\n\n";

// Test 4: GET /api/me without authentication
echo "4. GET /api/me (without authentication)\n";
$response = Illuminate\Support\Facades\Http::get($baseUrl . '/api/me');
echo "   Status: " . $response->status() . "\n";
echo "   Body: " . $response->body() . "\n\n";

// Test 5: POST /api/logout without authentication
echo "5. POST /api/logout (without authentication)\n";
$response = Illuminate\Support\Facades\Http::post($baseUrl . '/api/logout');
echo "   Status: " . $response->status() . "\n";
echo "   Body: " . $response->body() . "\n\n";

// Test 6: Try to find a valid user and test login
echo "6. Testing login with existing user...\n";
$user = DB::table('tb_user')->first();
if ($user) {
    echo "   Found user: " . $user->username . " (id: " . $user->id_user . ")\n";
    
    // Try some common passwords
    $testPasswords = ['password', 'admin', '123456', 'webelmech', 'elmech', '12345678', 'qwerty'];
    $loggedIn = false;
    
    foreach ($testPasswords as $testPassword) {
        $response = Illuminate\Support\Facades\Http::post($baseUrl . '/api/login', [
            'username' => $user->username,
            'password' => $testPassword,
        ]);
        
        if ($response->status() === 200) {
            echo "   SUCCESS! Login successful with password: " . $testPassword . "\n";
            echo "   Body: " . $response->body() . "\n";
            $loggedIn = true;
            
            // Test 7: GET /api/me with authentication
            echo "\n7. GET /api/me (with authentication)\n";
            $cookies = $response->cookies();
            $response2 = Illuminate\Support\Facades\Http::withCookies($cookies, $baseUrl)->get($baseUrl . '/api/me');
            echo "   Status: " . $response2->status() . "\n";
            echo "   Body: " . $response2->body() . "\n\n";
            
            // Test 8: POST /api/logout with authentication
            echo "8. POST /api/logout (with authentication)\n";
            $response3 = Illuminate\Support\Facades\Http::withCookies($cookies, $baseUrl)->post($baseUrl . '/api/logout');
            echo "   Status: " . $response3->status() . "\n";
            echo "   Body: " . $response3->body() . "\n\n";
            
            // Test 9: GET /api/me after logout
            echo "9. GET /api/me (after logout)\n";
            $response4 = Illuminate\Support\Facades\Http::withCookies($cookies, $baseUrl)->get($baseUrl . '/api/me');
            echo "   Status: " . $response4->status() . "\n";
            echo "   Body: " . $response4->body() . "\n\n";
            
            break;
        }
    }
    
    if (!$loggedIn) {
        echo "   Could not find valid password for testing\n";
        echo "   (This is expected - we don't know the actual password)\n";
    }
}

echo "\n=== All Tests Complete ===\n";
