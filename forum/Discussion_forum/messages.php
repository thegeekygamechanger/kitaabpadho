<?php
session_start();
require("header.php");
require("checkUser.php");
?>
<script type="text/javascript">
    document.getElementById("amessage").className = "active";
</script>

<a href="search.php">Send New Message</a>
<hr/>

<?php
//first fetch whom u have sent chats

$sql = "SELECT chat_id, user_id_from, user_id_to, fullname FROM Chatmaster INNER JOIN user ON chatmaster.user_id_to=user.user_id WHERE chatmaster.user_id_from=$_SESSION[uid]";
$rows = ExecuteQuery($sql);

while ($row = mysqli_fetch_array($rows)) {
    echo "<a href='readmsg.php?id=$row[chat_id]'>$row[fullname]</a>";

    $chat_result = ExecuteQuery("SELECT * FROM chat WHERE chat_id=$row[chat_id] ORDER BY cdatetime DESC");
    $chatrow = mysqli_fetch_array($chat_result);

    if ($chatrow) {
        echo "<br/><br/> $chatrow[message]<br/>";
        echo "$chatrow[cdatetime]";
    }

    echo "<hr style='border-top:1px solid #c3c3c3; border-bottom:1px solid white'/>";
}

// now fetch those that have sent chats to you

$sql = "SELECT chat_id, user_id_from, user_id_to, fullname FROM Chatmaster INNER JOIN user ON chatmaster.user_id_from=user.user_id WHERE chatmaster.user_id_to=$_SESSION[uid]";
$rows = ExecuteQuery($sql);

while ($row = mysqli_fetch_array($rows)) {
    echo "<a href='readmsg.php?id=$row[chat_id]'>$row[fullname]</a>";

    $chat_result = ExecuteQuery("SELECT * FROM chat WHERE chat_id=$row[chat_id] ORDER BY cdatetime DESC");
    $chatrow = mysqli_fetch_array($chat_result);

    if ($chatrow) {
        echo "<br/><br/> $chatrow[message]<br/>";
        echo "$chatrow[cdatetime]";
    }

    echo "<hr style='border-top:1px solid #c3c3c3; border-bottom:1px solid white'/>";
}
?>

<?php require("footer.php")?>
