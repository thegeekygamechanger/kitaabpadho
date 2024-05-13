-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: May 13, 2024 at 01:02 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.0.30

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `sell+hdp`
--

-- --------------------------------------------------------

--
-- Table structure for table `cart`
--

CREATE TABLE `cart` (
  `id` int(30) NOT NULL,
  `client_id` int(30) NOT NULL,
  `inventory_id` int(30) NOT NULL,
  `price` double NOT NULL,
  `quantity` int(30) NOT NULL,
  `date_created` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `cart`
--

INSERT INTO `cart` (`id`, `client_id`, `inventory_id`, `price`, `quantity`, `date_created`) VALUES
(4, 1, 1, 2500, 1, '2021-07-16 13:48:00');

-- --------------------------------------------------------

--
-- Table structure for table `categories`
--

CREATE TABLE `categories` (
  `id` int(30) NOT NULL,
  `category` varchar(250) NOT NULL,
  `description` text DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `date_created` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `categories`
--

INSERT INTO `categories` (`id`, `category`, `description`, `status`, `date_created`) VALUES
(1, 'Books & Guides', '&lt;span style=&quot;font-family: Arial;&quot;&gt;This category includes a wide range of educational books and guides aimed at aiding students in various subjects. From textbooks covering subjects like computer science, math, history, and language arts to reference books such as dictionaries and encyclopedias, this section provides resources essential for learning and research.&lt;/span&gt;', 1, '2021-07-16 09:08:44'),
(5, 'Tools & Instruments', '&lt;p&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Tools &amp;amp; Instruments encompasses a diverse collection of items necessary for academic pursuits. This category includes scientific tools like calculators, microscopes, and telescopes. These resources are indispensable for hands-on learning and practical applications.&lt;/span&gt;&lt;br&gt;&lt;/p&gt;', 1, '2024-05-13 13:31:47'),
(6, 'Reading Material', '&lt;p&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;This category offers a plethora of reading materials catering to different interests and genres. From fiction genres like fantasy, adventure, mystery/thriller, and romance to non-fiction topics like biographies, self-help, travel, and cooking, there\'s something for everyone. Additionally, literary works including historical fiction, classic literature, science fiction, and horror are available for those seeking deeper exploration of the written word.&lt;/span&gt;&lt;br&gt;&lt;/p&gt;', 1, '2024-05-13 13:36:54'),
(7, 'Learning Resources', '&lt;p&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Learning Resources provides a comprehensive collection of materials designed to facilitate learning and skill development. It includes online courses covering subjects like coding, language learning, photography, and business, allowing users to enhance their knowledge conveniently. Additionally, practice materials like worksheets, workbooks, and educational games, are available to support various learning needs.&lt;/span&gt;&lt;br&gt;&lt;/p&gt;', 1, '2024-05-13 15:10:06');

-- --------------------------------------------------------

--
-- Table structure for table `clients`
--

CREATE TABLE `clients` (
  `id` int(30) NOT NULL,
  `firstname` varchar(250) NOT NULL,
  `lastname` varchar(250) NOT NULL,
  `gender` varchar(20) NOT NULL,
  `contact` varchar(15) NOT NULL,
  `email` varchar(250) NOT NULL,
  `password` text NOT NULL,
  `default_delivery_address` text NOT NULL,
  `date_created` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `clients`
--

INSERT INTO `clients` (`id`, `firstname`, `lastname`, `gender`, `contact`, `email`, `password`, `default_delivery_address`, `date_created`) VALUES
(1, 'John', 'Smith', 'Male', '091023456789', 'jsmith@sample.com', '1254737c076cf867dc53d60a0364f38e', 'Sample Address', '2021-07-16 10:34:48');

-- --------------------------------------------------------

--
-- Table structure for table `inventory`
--

CREATE TABLE `inventory` (
  `id` int(30) NOT NULL,
  `product_id` int(30) NOT NULL,
  `quantity` double NOT NULL,
  `price` float NOT NULL,
  `date_created` datetime NOT NULL DEFAULT current_timestamp(),
  `date_updated` datetime DEFAULT NULL ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `inventory`
--

INSERT INTO `inventory` (`id`, `product_id`, `quantity`, `price`, `date_created`, `date_updated`) VALUES
(1, 1, 50, 2500, '2021-07-16 10:02:39', NULL),
(2, 2, 20, 3500, '2021-07-16 10:09:08', NULL),
(3, 3, 10, 2500, '2021-07-16 12:05:54', NULL),
(4, 4, 50, 1999.99, '2021-07-16 13:12:10', NULL),
(5, 8, 30, 1250, '2024-05-13 16:27:58', NULL),
(6, 7, 20, 500, '2024-05-13 16:28:11', NULL),
(7, 6, 10, 1400, '2024-05-13 16:29:09', NULL),
(8, 5, 15, 899, '2024-05-13 16:29:56', NULL),
(9, 11, 39, 499, '2024-05-13 16:30:21', NULL),
(10, 12, 50, 250, '2024-05-13 16:30:42', NULL),
(11, 9, 20, 499, '2024-05-13 16:30:57', NULL),
(12, 10, 10, 799, '2024-05-13 16:31:09', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `orders`
--

CREATE TABLE `orders` (
  `id` int(30) NOT NULL,
  `client_id` int(30) NOT NULL,
  `delivery_address` text NOT NULL,
  `payment_method` varchar(100) NOT NULL,
  `order_type` tinyint(1) NOT NULL COMMENT '1= pickup,2= deliver',
  `amount` double NOT NULL,
  `status` tinyint(2) NOT NULL DEFAULT 0,
  `paid` tinyint(1) NOT NULL DEFAULT 0,
  `date_created` datetime NOT NULL DEFAULT current_timestamp(),
  `date_updated` datetime DEFAULT NULL ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `orders`
--

INSERT INTO `orders` (`id`, `client_id`, `delivery_address`, `payment_method`, `order_type`, `amount`, `status`, `paid`, `date_created`, `date_updated`) VALUES
(1, 1, 'Sample Address', 'Online Payment', 2, 8500, 0, 1, '2021-07-16 11:14:58', NULL),
(4, 1, 'Sample Address', 'Online Payment', 2, 5000, 5, 1, '2021-07-16 13:13:42', '2021-07-16 13:52:56');

-- --------------------------------------------------------

--
-- Table structure for table `order_list`
--

CREATE TABLE `order_list` (
  `id` int(30) NOT NULL,
  `order_id` int(30) NOT NULL,
  `product_id` int(30) NOT NULL,
  `quantity` int(30) NOT NULL,
  `price` double NOT NULL,
  `total` double NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `order_list`
--

INSERT INTO `order_list` (`id`, `order_id`, `product_id`, `quantity`, `price`, `total`) VALUES
(1, 1, 2, 1, 3500, 3500),
(2, 1, 1, 2, 2500, 5000),
(3, 4, 3, 2, 2500, 5000);

-- --------------------------------------------------------

--
-- Table structure for table `products`
--

CREATE TABLE `products` (
  `id` int(30) NOT NULL,
  `category_id` int(30) NOT NULL,
  `sub_category_id` int(30) NOT NULL,
  `title` varchar(250) NOT NULL,
  `author` text NOT NULL,
  `description` text NOT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `date_created` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `products`
--

INSERT INTO `products` (`id`, `category_id`, `sub_category_id`, `title`, `author`, `description`, `status`, `date_created`) VALUES
(1, 1, 8, 'The Joy of PHP: A Beginner\\\'s Guide to Programming', 'Alan Forbes', '&lt;p&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;\\&quot;The Joy of PHP: A Beginner\\\'s Guide to Programming\\&quot; by Alan Forbes is an accessible and comprehensive introduction to PHP programming for beginners. Whether you\\\'re new to programming or looking to expand your skills, this book provides a step-by-step guide to learning PHP, a popular scripting language used for web development.&lt;/span&gt;&lt;/p&gt;&lt;p&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;In this book, Alan Forbes takes readers on a journey through the fundamentals of PHP programming, starting from the basics and gradually building up to more advanced topics. With a focus on practicality and hands-on learning, Forbes breaks down complex concepts into easy-to-understand explanations and provides numerous examples and exercises to reinforce learning.&lt;/span&gt;&lt;/p&gt;', 1, '2021-07-16 09:43:11'),
(2, 1, 8, 'Modern PHP: New Features and Good Practices', 'Josh Lockhart', '&lt;p&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;\\&quot;Modern PHP: New Features and Good Practices\\&quot; by Josh Lockhart is a comprehensive guide that explores the latest advancements and best practices in PHP development. Targeted at intermediate to advanced PHP developers, this book covers modern techniques and tools that enable developers to write cleaner, more efficient, and maintainable PHP code.&lt;/span&gt;&lt;/p&gt;&lt;p&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;In this book, Josh Lockhart takes readers on a journey through the evolution of PHP, highlighting new features introduced in recent versions of PHP and demonstrating how to leverage them effectively. From object-oriented programming and design patterns to security practices and performance optimization, each chapter provides practical insights and examples that illustrate modern PHP development principles.&lt;/span&gt;&lt;/p&gt;', 1, '2021-07-16 10:08:53'),
(3, 1, 9, 'English Grammar in Use', 'Raymond Murphy, Surai Pongtongcharoen', '&lt;p style=\\&quot;text-align: justify; \\&quot;&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;\\&quot;English Grammar in Use\\&quot; by Raymond Murphy and Surai Pongtongcharoen is a renowned self-study reference and practice book for learners of English at all levels. This comprehensive guide provides clear explanations of English grammar concepts and offers extensive practice exercises to help learners reinforce their understanding.&lt;/span&gt;&lt;/p&gt;&lt;p style=\\&quot;text-align: justify; \\&quot;&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;In this book, Raymond Murphy and Surai Pongtongcharoen present grammar topics in a logical and easy-to-follow manner, making it suitable for learners studying independently or in a classroom setting. Each unit focuses on a specific grammar point, such as verb tenses, prepositions, or conditionals, and includes clear explanations, examples, and exercises to reinforce learning.&lt;/span&gt;&lt;/p&gt;', 1, '2021-07-16 12:03:08'),
(4, 1, 9, 'English Grammar for Dummies', 'Geraldine Woods', '&lt;p style=\\&quot;margin-right: 0px; margin-bottom: 15px; margin-left: 0px; padding: 0px;\\&quot;&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;\\&quot;English Grammar for Dummies\\&quot; by Geraldine Woods is a comprehensive and user-friendly guide designed to help readers of all levels master the intricacies of English grammar. Whether you\\\'re a student, a professional, or someone simply looking to improve their writing skills, this book offers clear explanations, practical examples, and useful tips to enhance your understanding of grammar rules and usage.&lt;/span&gt;&lt;/p&gt;&lt;p style=\\&quot;margin-right: 0px; margin-bottom: 15px; margin-left: 0px; padding: 0px;\\&quot;&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;In this book, Geraldine Woods breaks down complex grammar concepts into easy-to-understand explanations, making it accessible for anyone seeking to improve their English language skills. From basic sentence structure to more advanced topics like verb tenses, punctuation, and sentence mechanics, each chapter is structured to provide step-by-step guidance and reinforce learning with exercises and quizzes.&lt;/span&gt;&lt;/p&gt;', 1, '2021-07-16 13:11:17'),
(5, 1, 10, 'Engineering Mathematics for GATE', 'H.K. Dass, Dr. Rama Verma, Er. Rajnish Verma', '&lt;p&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;\\&quot;Engineering Mathematics for GATE\\&quot; by H.K. Dass, Dr. Rama Verma, and Er. Rajnish Verma is a comprehensive textbook designed specifically for students preparing for the Graduate Aptitude Test in Engineering (GATE) examination. This book serves as a complete guide to mastering the mathematical concepts required for success in GATE and other competitive exams in the field of engineering.&lt;/span&gt;&lt;/p&gt;&lt;p&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;In this book, the authors provide a thorough coverage of mathematical topics commonly tested in the GATE exam, including calculus, linear algebra, differential equations, complex variables, probability, and statistics. Each topic is presented in a clear and systematic manner, with detailed explanations, solved examples, and practice exercises to help students understand and apply the concepts effectively.&lt;/span&gt;&lt;/p&gt;&lt;div&gt;&lt;br&gt;&lt;/div&gt;', 1, '2024-05-13 15:49:17'),
(6, 5, 11, 'Casio FX-82ES Plus 2nd Edition - Non-Programmable Scientific Calculator, 252 Functions ', '', '&lt;ul&gt;&lt;li&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;Redesigned ES PLUS series calculators featuring easy-to-understand Natural Textbook Display, Non-Programmable Scientific Calculator with 252 Functions&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;Stylish design but same function as Casio fx-82ES Plus 1st edition, 10-digit mantissa + 2-digit exponential display&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;Basic Trigonometrical &amp;amp; Statistics Functions, and many more functions, Multi-replay- Quick and easy recall of previously executed formulas for editing and re-execution&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;Colour coded keypad for easy key differentiation, Simple and easy to use, Comes with new slide on hard case&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;3-years warranty by manufacturer&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;Premium content A variety of original CASIO content is available to make learning mathematics fun.&lt;/span&gt;&lt;/li&gt;&lt;/ul&gt;', 1, '2024-05-13 15:53:51'),
(7, 5, 12, 'BOROSILICATE GLASS BEAKERS 10ML, 50ML, 100ML, 250ML, 500ML IN A BOX.', '', '&lt;ul&gt;&lt;li&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;100% GENUINE BOROSILICATE GLASS BEAKERS BY ABG INITIATIVE&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;This image represent actual product through color of the image and product size may slightly differ&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;Available in different sizes. Discount of bulk order&lt;/span&gt;&lt;/li&gt;&lt;/ul&gt;&lt;div&gt;&lt;br&gt;&lt;/div&gt;', 1, '2024-05-13 16:13:33'),
(8, 5, 13, 'AmScope M150C-I 40X-1000X All-Metal Optical Glass Lenses Cordless LED Student Biological Compound Microscope', '', '&lt;ul&gt;&lt;li&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;This is an ideal microscope for home school or for students in elementary to high school to learn sciences&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;360 degree rotatable monocular head offers five magnification settings 40X, 100X, 250X, 400X &amp;amp; 1000X&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;Widefield all optical glass elements includes single lens condenser with disc diaphragm&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;Sturdy all metal framework. Power Supply - 110 V&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;LED illumination system uses either an outlet (adapter included) or three AA batteries (or re-chargeable batteries)&lt;/span&gt;&lt;/li&gt;&lt;/ul&gt;', 1, '2024-05-13 16:14:11'),
(9, 6, 14, 'The Last Avatar (Age of Kalki #1)', 'Vishwas Mudagal', '&lt;p&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;From the Ashes of the World, A Hero Must Rise&lt;/span&gt;&lt;/p&gt;&lt;p&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;In the not-so-distant future, India has fallen and the world is on the brink of an apocalyptic war. An attack by the terrorist group Invisible Hand has brutally eliminated the Indian Prime Minister and the union cabinet. As a national emergency is declared, chaos, destruction and terror reign supreme. From the ashes of this falling world, rises an unconventional hero &ndash; a vigilante known only as Kalki. Backed by a secret society called The Rudras, Kalki, along with Nushen, the Chinese superhuman spy, must do the impossible to save his country and the world.&lt;/span&gt;&lt;/p&gt;&lt;p&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;But who is Kalki? A flesh and blood crusader with a mysterious past? Or the Messiah the world has been waiting for? The future of human survival depends on a single man. Will he become the living God prophesied as the last avatar of Lord Vishnu or will he fade away as an outlaw?&lt;/span&gt;&lt;/p&gt;', 1, '2024-05-13 16:15:11'),
(10, 6, 15, 'The Power of Your Subconscious Mind', 'Joseph Murphy', '&lt;p&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;This remarkable book by Dr. Joseph Murphy, one of the pioneering voices of affirmative thinking, will unlock for you the truly staggering powers of your subconscious mind. Combining time-honored spiritual wisdom with cutting-edge scientific research, Dr. Murphy explains how the subconscious mind influences every single thing that you do and how, by understanding it and learning to control its incredible force, you can improve the quality of your daily life. Everything, from the promotion that you wanted and the raise you think you deserve, to overcoming phobias and bad habits and strengthening interpersonal relationships, the Power of Your Subconscious Mind will open a world of happiness, success, prosperity and peace for you. It will change your life and your world by changing your beliefs.&lt;/span&gt;&lt;br&gt;&lt;/p&gt;', 1, '2024-05-13 16:16:34'),
(11, 6, 16, 'Literary Theory: The Complete Guide', 'Mary Klages', '&lt;p&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;Bringing together Mary Klages\\\'s bestselling introductory books Literary Theory: A Guide for the Perplexed and Key Terms in Literary Theory into one fully integrated and substantially revised, expanded and updated volume, this is an accessible and authoritative guide for anyone entering the often bewildering world of literary theory for the first time.&lt;/span&gt;&lt;/p&gt;&lt;p&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;Literary Theory: The Complete Guide includes:&lt;/span&gt;&lt;/p&gt;&lt;ul&gt;&lt;li&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;Accessible chapters on all the major schools of theory from deconstruction through psychoanalytic criticism to Marxism and postcolonialism&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;New chapters introducing ecocriticism and biographies&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;Expanded and updated guides to feminist theory, queer theory, postmodernism and globalization&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;New and fully integrated extracts of theoretical and literary texts to guide students through their use of theory&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;Accessible coverage of major theorists such as Saussure, Freud, Lacan, Foucault, Cixous, Deleuze and Guattari and Bhabha&lt;/span&gt;&lt;/li&gt;&lt;/ul&gt;&lt;p&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;Each chapter now includes reflection questions for class discussion or independent study and a cross-referenced glossary of key terms covered, as well as updated guides to further reading on each topic. Literary Theory: The Complete Guide is an essential starting point for students of critical theory.&lt;/span&gt;&lt;/p&gt;', 1, '2024-05-13 16:18:02'),
(12, 7, 18, 'SQL Practice Problems: 57 Beginning, Intermediate, and Advanced Challenges for You to Solve Using a \\\"Learn-by-doing\\\" Approach', 'Sylvia Moestl Vasilik', '&lt;p&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;\\&quot;SQL Practice Problems\\&quot; by Sylvia Moestl Vasilik is an essential resource for SQL learners at all levels, offering a hands-on approach to mastering SQL concepts. This book presents 57 practical SQL challenges designed to reinforce learning through real-world scenarios, allowing readers to develop their SQL skills through a \\&quot;learn-by-doing\\&quot; approach.&lt;/span&gt;&lt;/p&gt;&lt;p&gt;&lt;span style=\\&quot;font-family: Arial;\\&quot;&gt;Structured into beginning, intermediate, and advanced levels, this book caters to learners with varying degrees of SQL proficiency. Each chapter focuses on specific SQL topics and presents a series of exercises ranging from simple to complex, enabling readers to progressively enhance their SQL skills.&lt;/span&gt;&lt;/p&gt;', 1, '2024-05-13 16:19:38');

-- --------------------------------------------------------

--
-- Table structure for table `sales`
--

CREATE TABLE `sales` (
  `id` int(30) NOT NULL,
  `order_id` int(30) NOT NULL,
  `total_amount` double NOT NULL,
  `date_created` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `sales`
--

INSERT INTO `sales` (`id`, `order_id`, `total_amount`, `date_created`) VALUES
(1, 3, 8500, '2021-07-16 11:18:12'),
(2, 4, 5000, '2021-07-16 13:13:42');

-- --------------------------------------------------------

--
-- Table structure for table `sub_categories`
--

CREATE TABLE `sub_categories` (
  `id` int(30) NOT NULL,
  `parent_id` int(30) NOT NULL,
  `sub_category` varchar(250) NOT NULL,
  `description` text NOT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `date_created` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `sub_categories`
--

INSERT INTO `sub_categories` (`id`, `parent_id`, `sub_category`, `description`, `status`, `date_created`) VALUES
(3, 2, 'Literary', '&lt;p&gt;Sample Sub 103&lt;/p&gt;', 1, '2021-07-16 09:11:36'),
(4, 2, 'Historical', '&lt;p&gt;Sample 104&lt;/p&gt;', 1, '2021-07-16 09:12:51'),
(5, 3, 'Fantasy', '&lt;p&gt;Sample Sub 105&lt;/p&gt;', 1, '2021-07-16 09:13:28'),
(6, 3, 'Action and Adventure', '&lt;p&gt;Sample Sub 106&lt;/p&gt;', 1, '2021-07-16 09:13:49'),
(7, 4, 'Sub Cat 101', '&lt;p&gt;Sample Sub 107&lt;/p&gt;', 1, '2021-07-16 11:34:22'),
(8, 1, 'Textbooks', '&lt;ul&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Science&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Mathematics&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;History&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Literature&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Economics&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Computer Science&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Sociology&lt;/span&gt;&lt;/li&gt;&lt;/ul&gt;', 1, '2024-05-13 13:29:30'),
(9, 1, 'Reference Books', '&lt;ul&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Dictionaries&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Encyclopedias&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Atlases&lt;/span&gt;&lt;/li&gt;&lt;/ul&gt;', 1, '2024-05-13 13:30:36'),
(10, 1, 'Study Guides', '&lt;ul&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Exam Preparation Guides (GRE, GMAT, GATE etc.)&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Subject-specific study guides (Programming, Maths etc.)&lt;/span&gt;&lt;/li&gt;&lt;/ul&gt;', 1, '2024-05-13 13:31:16'),
(11, 5, 'Calculator', '&lt;ul&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Basic Calculators&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Scientific Calculators&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Graphing Calculators&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Financial Calculators&lt;/span&gt;&lt;/li&gt;&lt;/ul&gt;', 1, '2024-05-13 13:32:17'),
(12, 5, 'Laboratory Equipment', '&lt;ul&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Beakers&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Test Tubes&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Bunsen Burner&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Flasks&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Pipettes&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Safety Goggles&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Lab Coat/Apron&lt;/span&gt;&lt;/li&gt;&lt;/ul&gt;', 1, '2024-05-13 13:33:04'),
(13, 5, 'Scientific Tools', '&lt;ul&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Microscope&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Telescope&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Ruler and Meter Stick&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Digital Scale&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Thermometer&lt;/span&gt;&lt;/li&gt;&lt;/ul&gt;', 1, '2024-05-13 13:36:18'),
(14, 6, 'Fiction', '&lt;ul&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Fantasy&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Adventure&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Mystery/Thriller&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Romance&lt;/span&gt;&lt;/li&gt;&lt;/ul&gt;', 1, '2024-05-13 13:37:28'),
(15, 6, 'Non-fiction', '&lt;ul&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Biographies&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Self-help&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Travel&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Cooking&lt;/span&gt;&lt;/li&gt;&lt;/ul&gt;', 1, '2024-05-13 13:38:26'),
(16, 6, 'Literary Works', '&lt;ul&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Historical Fiction&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Classic Literature&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Science Fiction&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Horror&lt;/span&gt;&lt;/li&gt;&lt;/ul&gt;&lt;p&gt;&lt;br&gt;&lt;/p&gt;', 1, '2024-05-13 13:38:53'),
(17, 7, 'Online Courses', '&lt;ul&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Coding&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Language Learning&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Photography&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Business&lt;/span&gt;&lt;/li&gt;&lt;/ul&gt;', 1, '2024-05-13 15:10:37'),
(18, 7, 'Practice Materials', '&lt;ul&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Worksheets&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Workbooks&lt;/span&gt;&lt;/li&gt;&lt;li&gt;&lt;span style=&quot;font-family: Arial;&quot;&gt;Educational Games&lt;/span&gt;&lt;/li&gt;&lt;/ul&gt;', 1, '2024-05-13 15:30:42');

-- --------------------------------------------------------

--
-- Table structure for table `system_info`
--

CREATE TABLE `system_info` (
  `id` int(30) NOT NULL,
  `meta_field` text NOT NULL,
  `meta_value` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `system_info`
--

INSERT INTO `system_info` (`id`, `meta_field`, `meta_value`) VALUES
(1, 'name', 'Online Book Shop'),
(6, 'short_name', 'Books'),
(11, 'logo', 'uploads/1626397500_book_logo.jpg'),
(13, 'user_avatar', 'uploads/user_avatar.jpg'),
(14, 'cover', 'uploads/1626397620_books.jpg');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(50) NOT NULL,
  `firstname` varchar(250) NOT NULL,
  `lastname` varchar(250) NOT NULL,
  `username` text NOT NULL,
  `password` text NOT NULL,
  `avatar` text DEFAULT NULL,
  `last_login` datetime DEFAULT NULL,
  `type` tinyint(1) NOT NULL DEFAULT 0,
  `date_added` datetime NOT NULL DEFAULT current_timestamp(),
  `date_updated` datetime DEFAULT NULL ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `firstname`, `lastname`, `username`, `password`, `avatar`, `last_login`, `type`, `date_added`, `date_updated`) VALUES
(1, 'Adminstrator', 'Admin', 'admin', '0192023a7bbd73250516f069df18b500', 'uploads/1624240500_avatar.png', NULL, 1, '2021-01-20 14:02:37', '2021-06-21 09:55:07'),
(4, 'John', 'Smith', 'jsmith', '1254737c076cf867dc53d60a0364f38e', NULL, NULL, 0, '2021-06-19 08:36:09', '2021-06-19 10:53:12'),
(5, 'Claire', 'Blake', 'cblake', '4744ddea876b11dcb1d169fadf494418', NULL, NULL, 0, '2021-06-19 10:01:51', '2021-06-19 12:03:23');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `cart`
--
ALTER TABLE `cart`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `categories`
--
ALTER TABLE `categories`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `clients`
--
ALTER TABLE `clients`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `inventory`
--
ALTER TABLE `inventory`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `orders`
--
ALTER TABLE `orders`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `order_list`
--
ALTER TABLE `order_list`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `products`
--
ALTER TABLE `products`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `sales`
--
ALTER TABLE `sales`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `sub_categories`
--
ALTER TABLE `sub_categories`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `system_info`
--
ALTER TABLE `system_info`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `cart`
--
ALTER TABLE `cart`
  MODIFY `id` int(30) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `categories`
--
ALTER TABLE `categories`
  MODIFY `id` int(30) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `clients`
--
ALTER TABLE `clients`
  MODIFY `id` int(30) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `inventory`
--
ALTER TABLE `inventory`
  MODIFY `id` int(30) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `orders`
--
ALTER TABLE `orders`
  MODIFY `id` int(30) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `order_list`
--
ALTER TABLE `order_list`
  MODIFY `id` int(30) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `products`
--
ALTER TABLE `products`
  MODIFY `id` int(30) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `sales`
--
ALTER TABLE `sales`
  MODIFY `id` int(30) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `sub_categories`
--
ALTER TABLE `sub_categories`
  MODIFY `id` int(30) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=19;

--
-- AUTO_INCREMENT for table `system_info`
--
ALTER TABLE `system_info`
  MODIFY `id` int(30) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(50) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
