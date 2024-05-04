<?php
require("header.php");

$uid = $_POST["uid"];
$pwd = $_POST["pwd"];

if (isset($uid) && isset($pwd)) {
    $con = mysqli_connect("localhost", "root", "", "tech_forum");
    $uid = mysqli_real_escape_string($con, $uid);
    $pwd = mysqli_real_escape_string($con, $pwd);
    $sql = "SELECT * FROM user WHERE username='$uid' AND password='$pwd'";
    $result = mysqli_query($con, $sql);

    if (mysqli_num_rows($result) == 1) {
        $row = mysqli_fetch_assoc($result);

        session_start();
        $_SESSION["uid"] = $row["user_id"];
        $_SESSION["fn"] = $row["fullname"];

        $sql = "UPDATE User SET isuser=true WHERE username='$uid'";
        mysqli_query($con, $sql);

        if ($row["user_type"] == "admin") {
            header("location: admin/home.php");
        } else {
            header("location: uhome.php");
        }
    } else {
        header("location: index.php?act=invalid");
    }

    mysqli_close($con);
}

require("footer.php");
?>
