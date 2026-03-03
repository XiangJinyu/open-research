const fs = require("fs")
const path = require("path")

// 读取 .env 文件
function loadEnv(file) {
  try {
    return Object.fromEntries(
      fs.readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const [k, ...v] = line.split("=")
          return [k.trim(), v.join("=").trim()]
        }),
    )
  } catch {
    return {}
  }
}

const env = loadEnv(path.join(__dirname, ".env"))
const port = env.RESEARCH_PORT || "4096"

module.exports = {
  apps: [
    {
      name: "research-serve",
      script: "research",
      interpreter: "none",
      args: `serve --port ${port}`,
      restart_delay: 3000,
      max_restarts: 999,
      env: {
        NO_PROXY: "127.0.0.1,localhost",
        no_proxy: "127.0.0.1,localhost",
      },
    },
    {
      name: "bridge-feishu",
      script: "src/index.ts",
      interpreter: "bun",
      cwd: __dirname,
      restart_delay: 5000,  // 等 research-serve 就绪后再连
      max_restarts: 999,
      env: {
        NO_PROXY: "127.0.0.1,localhost",
        no_proxy: "127.0.0.1,localhost",
        ...env,
      },
    },
  ],
}
