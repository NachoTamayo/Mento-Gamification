module.exports = {
  apps: [
    {
      name: "Gamification",
      script: "dist/server.js", // o "npm", args: "start"
      cwd: "/var/www/MentoPoker/Gamification/current", // symlink que apuntaremos a la release activa
    },
  ],
};
