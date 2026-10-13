module.exports = {
  apps: [
    {
      name: "yawmi",
      cwd: __dirname + "/web",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: "8014",
        HOSTNAME: "0.0.0.0",
      },
      max_memory_restart: "400M",
      autorestart: true,
    },
  ],
};
