<?php
ob_start();
require("utility.php");

// Establish MySQLi connection
$connection = mysqli_connect("localhost", "root", "", "tech_forum");

if (!$connection) {
    die("Connection failed: " . mysqli_connect_error());
}

// Escape user input to prevent SQL injection
$u_name = mysqli_real_escape_string($connection, $_POST['u_name']);
$f_name = mysqli_real_escape_string($connection, $_POST['f_name']);
$pwd = mysqli_real_escape_string($connection, $_POST['pwd']);
$e_mail = mysqli_real_escape_string($connection, $_POST['e_mail']);
$gender = mysqli_real_escape_string($connection, $_POST['gender']);
$dob = mysqli_real_escape_string($connection, $_POST['dob']);
$add = mysqli_real_escape_string($connection, $_POST['add']);
$sta = mysqli_real_escape_string($connection, $_POST['sta']);
$cou = mysqli_real_escape_string($connection, $_POST['cou']);

// Handle file upload
$ima = $_FILES['ima']['name'];
$imup = $_FILES['ima']['tmp_name'];
$path = "ups/$ima";
move_uploaded_file($imup, $path);

$sql = "INSERT INTO user (username, fullname, password, e_mail, gender, dob, user_type, address, state, country, uimg) 
        VALUES ('$u_name', '$f_name', '$pwd', '$e_mail', '$gender', '$dob', 'user', '$add', '$sta', '$cou', '$path')";

$result = mysqli_query($connection, $sql);

if ($result) {
    header("location:notification.php");
} else {
    header("location:register.php");
}

// Close connection
mysqli_close($connection);
?>
