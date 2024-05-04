<?php 
// DB credentials.
define('DB_HOST','sql306.infinityfree.com');
define('DB_USER','if0_36336358');
define('DB_PASS','dZWTGj4eut');
define('DB_NAME','if0_36336358_library');
// Establish database connection.
try {
    $dbh = new PDO("mysql:host=".DB_HOST.";dbname=".DB_NAME, DB_USER, DB_PASS);
    // Set the PDO error mode to exception
    $dbh->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    echo "Connected successfully";
} catch(PDOException $e) {
    echo "Connection failed: " . $e->getMessage();
}
?>
