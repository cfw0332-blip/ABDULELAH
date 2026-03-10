import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    transports: ["websocket"],
    pingTimeout: 60000,
  });

  const PORT = 3000;

  // Socket.io logic
  const rooms = new Map();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("get-rooms", () => {
      const availableRooms = Array.from(rooms.entries())
        .filter(([_, room]) => {
          // Only show rooms that have at least one player but are not full (less than 2 players for team1/team2)
          const playerTeams = room.players.map((p: any) => p.team);
          const hasTeam1 = playerTeams.includes("team1");
          const hasTeam2 = playerTeams.includes("team2");
          return hasTeam1 && !hasTeam2; // Room is waiting for an opponent
        })
        .map(([id, room]) => ({
          id,
          hostName: room.players.find((p: any) => p.team === "team1")?.name || "مضيف مجهول",
          playerCount: room.players.length
        }));
      socket.emit("available-rooms", availableRooms);
    });

    socket.on("get-spectate-rooms", () => {
      const spectateRooms = Array.from(rooms.entries())
        .filter(([_, room]) => room.players.length > 0)
        .map(([id, room]) => ({
          id,
          team1Name: room.players.find((p: any) => p.team === "team1")?.name || "---",
          team2Name: room.players.find((p: any) => p.team === "team2")?.name || "---",
          playerCount: room.players.length,
          spectatorCount: room.players.filter((p: any) => p.team === "spectator").length,
          status: room.gameState ? room.gameState.status : "waiting"
        }));
      socket.emit("spectate-rooms", spectateRooms);
    });

    socket.on("join-room", ({ roomId, team, playerName, playerColor }) => {
      console.log("join-room received:", { roomId, team, playerName, playerColor });
      // Check if room exists
      if (!rooms.has(roomId)) {
        if (team === "team1") {
          // Create new room
          rooms.set(roomId, { 
            players: [], 
            gameState: null,
            categories: []
          });
        } else {
          socket.emit("error", "الغرفة غير موجودة");
          return;
        }
      }

      socket.join(roomId);
      const room = rooms.get(roomId);
      
      if (team === "spectator") {
        const spectatorCount = room.players.filter((p: any) => p.team === "spectator").length;
        if (spectatorCount >= 10) {
          socket.emit("error", "تم الوصول للحد الأقصى من المشاهدين (10)");
          return;
        }
      } else {
        // Check if team is already taken
        const existingPlayer = room.players.find((p: any) => p.team === team);
        if (existingPlayer) {
          socket.emit("error", "هذا الفريق محجوز بالفعل");
          return;
        }

        // Check if color is already taken (only for players)
        const existingColor = room.players.find((p: any) => p.color === playerColor && p.team !== "spectator");
        if (existingColor) {
          socket.emit("error", "عذراً، هذا اللون محجوز لقائد الغرفة (الأولوية للمنشئ). الرجاء اختيار لون آخر.");
          return;
        }
      }

      room.players.push({ 
        id: socket.id, 
        team, 
        name: playerName || `Player ${socket.id.substr(0, 4)}`,
        color: team === "spectator" ? "gray-500" : (playerColor || (team === "team1" ? "red-500" : "emerald-500"))
      });
      
      socket.emit("join-success", { roomId, team });
      io.to(roomId).emit("room-update", room.players);
      
      if (room.gameState) {
        socket.emit("game-state-sync", room.gameState);
      }
    });

    socket.on("update-player-color", ({ roomId, color }) => {
      const room = rooms.get(roomId);
      if (room) {
        const player = room.players.find((p: any) => p.id === socket.id);
        if (player && player.team !== "spectator") {
          // Check if color is taken by someone else
          const otherPlayerWithColor = room.players.find((p: any) => p.color === color && p.id !== socket.id && p.team !== "spectator");
          
          if (otherPlayerWithColor) {
            // Priority for host (team1)
            if (player.team === "team2" && otherPlayerWithColor.team === "team1") {
              socket.emit("error", "عذراً، هذا اللون محجوز لقائد الغرفة (الأولوية للمنشئ).");
              return;
            }
            
            // If host picks a color guest has, guest should be bumped
            if (player.team === "team1" && otherPlayerWithColor.team === "team2") {
              // Find a new color for the guest that isn't the one the host just picked
              const availableColors = ["red-500", "blue-500", "yellow-500", "emerald-500"].filter(c => c !== color);
              otherPlayerWithColor.color = availableColors[0];
            }
          }
          
          player.color = color;
          io.to(roomId).emit("room-update", room.players);
        }
      }
    });

    socket.on("find-friend", ({ code, requesterName, requesterCode, requesterColor }) => {
      // Broadcast to all connected sockets to find the one with this code
      io.emit("who-is-code", { code, requesterId: socket.id, requesterName, requesterCode, requesterColor });
    });

    socket.on("i-am-code", ({ requesterId, myName, myCode, myColor }) => {
      io.to(requesterId).emit("friend-found", { name: myName, code: myCode, color: myColor });
    });

    socket.on("send-invite", ({ friendCode, roomId, hostName }) => {
      // Broadcast to find the friend and send them the invite
      io.emit("incoming-invite", { friendCode, roomId, hostName, hostId: socket.id });
    });

    socket.on("invite-response", ({ hostId, accepted, roomId }) => {
      io.to(hostId).emit("invite-status", { accepted, roomId });
    });

    socket.on("sync-game-state", ({ roomId, gameState }) => {
      const room = rooms.get(roomId);
      if (room) {
        room.gameState = gameState;
        socket.to(roomId).emit("game-state-sync", gameState);
      }
    });

    socket.on("game-action", ({ roomId, action, data }) => {
      // Broadcast action to other players in the room
      socket.to(roomId).emit("game-action", { action, data });
    });

    socket.on("leave-room", ({ roomId }) => {
      socket.leave(roomId);
      const room = rooms.get(roomId);
      if (room) {
        const playerIndex = room.players.findIndex((p: any) => p.id === socket.id);
        if (playerIndex !== -1) {
          room.players.splice(playerIndex, 1);
          if (room.players.length === 0) {
            rooms.delete(roomId);
          } else {
            io.to(roomId).emit("room-update", room.players);
          }
        }
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      rooms.forEach((room, roomId) => {
        const playerIndex = room.players.findIndex((p: any) => p.id === socket.id);
        if (playerIndex !== -1) {
          room.players.splice(playerIndex, 1);
          if (room.players.length === 0) {
            rooms.delete(roomId);
          } else {
            io.to(roomId).emit("room-update", room.players);
          }
        }
      });
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
