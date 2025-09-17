const { Client, GatewayIntentBits, Partials } = require("discord.js");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const {
  token,
  coachRoles,
  proRoles,
  basicRoles,
  reactions,
  handChannels,
  guildId,
  userTable,
  user,
  password,
  host,
  database,
  port,
  endPoint,
  access_key,
  awsdb,
} = require("../config/config_game.json");

// Ruta del archivo donde se guardarán los logs
const logFilePath = path.join(__dirname, "bot.log");

// Método para escribir logs
function log(message) {
  const now = new Date();
  const timestamp = `[${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(
    now.getSeconds()
  ).padStart(2, "0")}]`;

  fs.appendFile(logFilePath, `${timestamp} ${message}\n`, (err) => {
    if (err) console.error("Error al escribir en log:", err);
  });
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const getAWSConnection = async () => {
  const con = await mysql.createConnection({
    host: awsdb.host,
    user: awsdb.user,
    password: awsdb.password,
    database: awsdb.database,
    port: awsdb.port,
  });

  return con;
};

async function checkHonor(emisor, receptor, message) {
  let honorable = true;
  // Chequeamos si el emisor y el receptor tienen roles válidos para dar/recibir honor. Sin un rol válido, no se concede honor
  // Para ello tenemos que buscar los roles del emisor y receptor en el servidor, y compararlos con los roles válidos del config_game.json
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    log("No se encontró el servidor al comprobar honor.");
    honorable = false;
  }

  const emisorMember = guild.members.cache.get(emisor.id);
  if (!emisorMember) {
    log(`No se encontró el miembro emisor ${emisor.username} al comprobar honor.`);
    honorable = false;
  }
  const receptorMember = guild.members.cache.get(receptor.id);
  if (!receptorMember) {
    log(`No se encontró el miembro receptor ${receptor.username} al comprobar honor.`);
    honorable = false;
  }
  const emisorHasRole = emisorMember.roles.cache.some(
    (role) => coachRoles.includes(role.id) || proRoles.includes(role.id) || basicRoles.includes(role.id)
  );
  const receptorHasRole = receptorMember.roles.cache.some(
    (role) => coachRoles.includes(role.id) || proRoles.includes(role.id) || basicRoles.includes(role.id)
  );
  // Si el emisor no tiene rol válido, o si el receptor no tiene rol válido
  if (!emisorHasRole || !receptorHasRole) {
    log(`El honor de ${emisor.username} a ${receptor.username} no se concede por no tener un rol válido.`);
    honorable = false;
  }

  if (message.content.length < 20) {
    log(`El honor de ${emisor.username} a ${receptor.username} no se concede por ser un mensaje muy corto.`);
    honorable = false;
  }

  //Primero chequeamos si el emisor ha dado honor en los últimos 5 minutos
  let con;
  try {
    con = await getAWSConnection();

    const [rows1] = await con.execute(
      "SELECT MAX(fecha) AS maxfecha FROM honor_logs WHERE emisor = ? AND receptor = ? AND fecha > NOW() - INTERVAL 1 MINUTE",
      [emisor.id, receptor.id]
    );
    if (rows1[0]?.maxfecha) {
      log(
        `El honor de ${emisor.username} a ${receptor.username} no se concede por haber dado honor en el último 1 minuto.`
      );
      return false;
    }

    const [rows2] = await con.execute("SELECT COUNT(*) AS count FROM honor_logs WHERE emisor = ? AND post_id = ?", [
      emisor.id,
      message.id,
    ]);
    if ((rows2[0]?.count ?? 0) > 0) {
      log(
        `El honor de ${emisor.username} a ${receptor.username} no se concede por haber dado honor ya en este mensaje.`
      );
      return false;
    }

    return true;
  } catch (error) {
    console.log(error);
    honorable = false;
  } finally {
    if (con) {
      try {
        await con.end();
      } catch (_) {}
    }
  }
}

async function createAWSQuery(query, callback) {
  let con;
  try {
    con = await getAWSConnection();
    const [rows] = await con.execute(query);
    return callback(rows);
  } catch (error) {
    console.log(error);
    return callback("error");
  } finally {
    if (con) {
      try {
        await con.end();
      } catch (_) {}
    }
  }
}

async function createQuery(query, callback) {
  let con;
  try {
    con = await mysql.createConnection({
      host: host,
      user: user,
      password: password,
      database: database,
      port: port,
    });

    const [rows] = await con.execute(query);
    return callback(rows);
  } catch (error) {
    console.log(error);
    return callback("error");
  } finally {
    if (con) {
      try {
        await con.end();
      } catch (_) {}
    }
  }
}

async function addPoints(id, points, razon, user) {
  const url = `${endPoint}/points`;
  const payload = {
    access_key: access_key,
    user_id: Number(id),
    type: "add",
    amount: Number(points),
    reference: "Bot_de_Discord",
    entry: String(razon),
  };

  const res = await axios.post(url, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: 15000,
  });

  log(`${user.username} ha concedido ${points} puntos al usuario ${id} por ${razon}`);
  return res.data;
}

async function addHonor(id, points, razon, emisor, receptor, mensaje, callback) {
  const url = `${endPoint}/points`;
  const payload = {
    access_key: access_key,
    user_id: Number(id),
    type: "add",
    ctype: "honor",
    amount: Number(points),
    reference: "Bot_de_Discord_Honor",
    entry: String(razon),
  };

  const res = await axios.post(url, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: 15000,
  });

  return callback(res.data, emisor, receptor, mensaje);
}

function buscarUsuario(id, callback) {
  var query = `SELECT * FROM ${userTable} WHERE discord = ${id}`;
  createQuery(query, callback);
}

client.once("ready", () => {
  console.log(`Conectado como ${client.user.tag}`);
});

client.on("messageReactionAdd", async (reaction, user) => {
  // Aseguramos que el caché está completo
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      console.error("No pude obtener la reacción:", error);
      return;
    }
  }

  const guild = reaction.message.guild;
  if (!guild || guild.id !== guildId) return;
  const member = await guild.members.fetch(user.id);

  const hasSpecialRole = member.roles.cache.some((role) => coachRoles.includes(role.id));

  if (hasSpecialRole && reaction.emoji.id != reactions.honor) {
    buscarUsuario(reaction.message.author.id, async (rows) => {
      let userId;
      if (rows.length > 0) {
        userId = rows[0].ID;
      } else {
        userId = null;
        log(
          `Usuario con ID de Discord ${reaction.message.author.id} no encontrado en la base de datos. No se otorgarán puntos en el mensaje ${reaction.message.id}`
        );
        return;
      }
      let points = 0;
      let razon = null;
      let insert = false;
      let proUser = false;
      const autor = await guild.members.fetch(reaction.message.author.id);
      if (autor.roles.cache.some((role) => proRoles.includes(role.id))) {
        proUser = true;
      }
      if (handChannels.includes(reaction.message.channel.parentId)) {
        if (reaction.emoji.name === "✅" && hasSpecialRole) {
          razon = `Mano Publicada`;
          points = proUser ? 100 : 20;
          insert = true;
        }
      }

      if (reaction.emoji.id === reactions.respuestaBuena) {
        console.log("Reacción de Respuesta Buena/Relevante detectada");
        razon = `Respuesta Buena/Relevante`;
        points = proUser ? 100 : 20;
        insert = true;
      } else if (reaction.emoji.id === reactions.respuestaPerfecta) {
        console.log("Reacción de Respuesta Perfecta detectada");
        razon = `Respuesta Perfecta`;
        points = proUser ? 150 : 30;
        insert = true;
      }

      if (!insert) return;

      addPoints(userId, points, razon, user, (response) => {
        console.log(`Puntos añadidos: ${response}`);
      });
    });
  } else if (reaction.emoji.id === reactions.honor && reaction.message.author.id != user.id) {
    buscarUsuario(reaction.message.author.id, async (rows) => {
      let userId;
      if (rows.length > 0) {
        userId = rows[0].ID;
      } else {
        userId = null;
        log(
          `Usuario con ID de Discord ${reaction.message.author.id} no encontrado en la base de datos. No se otorgarán puntos en el mensaje ${reaction.message.id}`
        );
        return;
      }
      let points = 0;
      let razon = null;
      let proUser = false;
      const autor = await guild.members.fetch(reaction.message.author.id);
      if (autor.roles.cache.some((role) => proRoles.includes(role.id))) {
        proUser = true;
      }

      console.log("Reacción de Honor detectada");
      razon = `Honor`;
      points = proUser ? 10 : 5;

      await checkHonor(user, reaction.message.author, reaction.message).then((honorable) => {
        if (honorable) {
          addHonor(userId, points, razon, user, autor, reaction.message, (respuesta, emisor, receptor, mensaje) => {
            const res = createAWSQuery(
              `INSERT INTO honor_logs (emisor, receptor, post_id) VALUES (${emisor.id}, ${receptor.id}, '${mensaje.id}')`,
              (response) => {
                if (response === "error") {
                  log(`Error al registrar el honor de ${emisor.id} a ${receptor.id} en la base de datos.`);
                  return;
                }
                log(`Registro de honor de ${emisor.id} a ${receptor.id} insertado correctamente en la base de datos.`);
              }
            );
          });
        }
      });
    });
  }
});

client.login(token);
