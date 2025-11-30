module.exports = {
    apps: [{
        name: "discord-bot",
        script: "./dist/index.js",
        env: {
            NODE_ENV: "production",
        }
    }]
}
