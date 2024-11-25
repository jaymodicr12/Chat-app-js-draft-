const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const userModel = require("./models/user");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

let loggedInUsers = [];

app.set("view engine", "ejs");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static("public"));

// Routes
app.get("/", (req, res) => res.render("registration"));

app.post("/create", async (req, res) => {
    const { username, email, password } = req.body;
    const user = await userModel.findOne({ email });
    if (user) return res.status(500).send("Email already exists");

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const createdUser = await userModel.create({ username, email, password: hash });
    const token = jwt.sign({ email, userid: createdUser._id }, "secret");
    res.cookie("token", token);
    res.redirect("/login");
});

app.get("/login", (req, res) => res.render("login"));

app.post("/login", async (req, res) => {
    const user = await userModel.findOne({ email: req.body.email });
    if (!user) return res.status(500).send("Invalid credentials");

    const isMatch = await bcrypt.compare(req.body.password, user.password);
    if (!isMatch) return res.status(500).send("Invalid credentials");

    const token = jwt.sign({ email: user.email, userid: user._id }, "secret");
    res.cookie("token", token);
    res.redirect("/profile");
});

app.get("/profile", async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.redirect("/login");

    try {
        const loginUser = jwt.verify(token, "secret");
        const user = await userModel.findOne({ email: loginUser.email });
        if (!user) return res.redirect("/login");

        const loginTime = new Date().toLocaleTimeString();
        const userStatus = "Online";

        loggedInUsers = loggedInUsers.filter((u) => u.email !== user.email);
        loggedInUsers.push({ username: user.username, email: user.email, loginTime, status: userStatus, socketId: null });

        res.render("profile", { username: user.username, users: loggedInUsers });
    } catch {
        res.redirect("/login");
    }
});

app.get("/logout", (req, res) => {
    const token = req.cookies.token;
    if (token) {
        const decoded = jwt.verify(token, "secret");
        const email = decoded.email;

        io.emit("user_logged_out", email);
        res.clearCookie("token");
    }
    res.redirect("/login");
});

// Socket.IO Logic
io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    socket.on("user_logged_in", (user) => {
        const index = loggedInUsers.findIndex((u) => u.email === user.email);
        if (index !== -1) {
            loggedInUsers[index].socketId = socket.id;
        } else {
            loggedInUsers.push({ ...user, socketId: socket.id });
        }
        io.emit("update_user_list", loggedInUsers);
    });

    // Listen for private messages from the sender
    socket.on("send_private_message", (data) => {
        const { message, recipientSocketId, username } = data;

        console.log(`Message from ${username} to ${recipientSocketId}: ${message}`);

        // Send the message to the recipient
        io.to(recipientSocketId).emit("receive_private_message", {
            message: message,
            sender: username,
        });
    });

    socket.on("disconnect", () => {
        loggedInUsers = loggedInUsers.filter((u) => u.socketId !== socket.id);
        io.emit("update_user_list", loggedInUsers);
    });
});

server.listen(4000, () => console.log("Server is running on port 4000"));
