// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: "omni",
    script: "tsx",
    args: "index.ts",
    interpreter: "none"
  }]
}