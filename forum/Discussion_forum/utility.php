<?php
error_reporting(1);

function ExecuteQuery($SQL)
{   
    $con = mysqli_connect("localhost", "root", "", "tech_forum");
    if (!$con) {
        die("Connection failed: " . mysqli_connect_error());
    }
    $result = mysqli_query($con, $SQL);
    mysqli_close($con);
    return $result;
}

function ExecuteNonQuery($SQL)
{
    $con = mysqli_connect("localhost", "root", "", "tech_forum");
    if (!$con) {
        die("Connection failed: " . mysqli_connect_error());
    }
    $result = mysqli_query($con, $SQL);
    mysqli_close($con);
    return $result;
}
?>
