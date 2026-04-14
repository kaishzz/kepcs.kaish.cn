module.exports = {
  apps: [
    {
      name: "kepcs-pay",
      script: "npm",
      args: "start",
      cwd: "/var/www/kepcs.kaish.cn",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
