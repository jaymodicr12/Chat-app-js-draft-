const express = require("express")
const app = express()
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")
const userModel = require("./models/user")
const postModel = require("./models/post")


const cookieParser = require("cookie-parser")
const path = require("path")

app.set("view engine", "ejs")
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, "public")))
app.use(cookieParser())

app.get("/", (req, res) => {
    res.render("registration")
})

app.post("/create", async (req, res) => {
    const { username, email, password} = req.body;

    const user = await userModel.findOne({email})
    if(user) return res.status(500).send("Email already exist")
        
    bcrypt.genSalt(10, (err, salt) => {
        bcrypt.hash(password, salt, async (err, hash) => {
            const createdUser = await userModel.create({
                username,
                email,
                password: hash
            })

            let token = jwt.sign({email: email, userid: createdUser._id}, "secret")
            res.cookie("token", token)
            res.redirect("/login")
        });
    });
})

app.get("/login", (req, res) => {
    res.render("login")
})

app.post("/login", async(req, res) => {
    let user = await userModel.findOne({email: req.body.email})
    if(!user) return res.status(500).send("Something went wrong")
        bcrypt.compare(req.body.password, user.password, function(err, result) {
            if(result){
                let token = jwt.sign({email: user.email}, "secret")
                res.cookie("token", token)
                res.redirect("profile")
            }
                else res.send("Something Went Wrong")
        });
})

app.get("/profile", async (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.redirect("/login");

    try {
        const loginuser = jwt.verify(token, "secret");
        const user = await userModel.findOne({ email: loginuser.email });
        if (!user) return res.redirect("/login");

        res.render("profile", { username: user.username });
    } catch (error) {
        res.redirect("/login");
    }
});

app.post("/post", async (req, res) => {
    try {
        const token = req.cookies.token;
        if (!token) return res.status(401).send("Unauthorized");

        // Decode the email from the token
        const decoded = jwt.verify(token, "secret");
        const user = await userModel.findOne({ email: decoded.email });
        if (!user) return res.status(404).send("User not found");

        const { content } = req.body;

        // Create a new post
        const post = await postModel.create({
            user: user._id,
            content,
        });

        // Update the user's posts array
        user.posts.push(post._id);
        await user.save();

        res.redirect("/profile");
    } catch (error) {
        console.error("Error creating post:", error);
        res.status(500).send("An error occurred");
    }
});

app.get("/profile", async (req, res) => {
    const decoded = jwt.verify(token, "secret");
    const user = await userModel.findOne({ email: decoded.email }).populate("posts");
    res.render("profile", { username: user.username, user });
})

app.get("/logout", (req, res) => {
    res.cookie("token", "")
    res.send("/login")
})


app.listen(3000)