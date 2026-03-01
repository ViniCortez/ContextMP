import express from "express";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

app.use(express.json({ limit: "50mb" }));

// Game State
interface Player {
  id: string;
  name: string;
  score: number;
  guesses: { word: string; similarity: number }[];
}

interface Room {
  id: string;
  hostId: string;
  players: Record<string, Player>;
  secretWord: string;
  status: "lobby" | "playing" | "finished";
  language: "en" | "pt-BR";
}

const rooms: Record<string, Room> = {};

const WORDS_EN = ["apple", "ocean", "mountain", "computer", "guitar", "planet", "galaxy", "coffee", "library", "desert"];
const WORDS_PT = ["maca", "oceano", "montanha", "computador", "violao", "planeta", "galaxia", "cafe", "biblioteca", "deserto"];

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("createRoom", (playerName: string, language: "en" | "pt-BR", callback: (roomId: string) => void) => {
    const roomId = uuidv4().substring(0, 6).toUpperCase();
    rooms[roomId] = {
      id: roomId,
      hostId: socket.id,
      players: {
        [socket.id]: { id: socket.id, name: playerName, score: 0, guesses: [] },
      },
      secretWord: "",
      status: "lobby",
      language: language || "en",
    };
    socket.join(roomId);
    callback(roomId);
    io.to(roomId).emit("roomUpdated", rooms[roomId]);
  });

  socket.on("joinRoom", (roomId: string, playerName: string, callback: (success: boolean) => void) => {
    const room = rooms[roomId];
    if (room) {
      room.players[socket.id] = { id: socket.id, name: playerName, score: 0, guesses: [] };
      socket.join(roomId);
      callback(true);
      io.to(roomId).emit("roomUpdated", room);
    } else {
      callback(false);
    }
  });

  socket.on("startGame", (roomId: string) => {
    const room = rooms[roomId];
    if (room && room.hostId === socket.id) {
      room.status = "playing";
      const wordsList = room.language === "pt-BR" ? WORDS_PT : WORDS_EN;
      room.secretWord = wordsList[Math.floor(Math.random() * wordsList.length)];
      
      // Reset players
      Object.values(room.players).forEach(p => {
        p.score = 0;
        p.guesses = [];
      });

      io.to(roomId).emit("roomUpdated", room);
      io.to(roomId).emit("gameStarted");
    }
  });

  socket.on("guessWord", async (roomId: string, guess: string) => {
    const room = rooms[roomId];
    if (!room || room.status !== "playing") return;

    const player = room.players[socket.id];
    if (!player) return;

    try {
      const langPrompt = room.language === "pt-BR" ? "Portuguese" : "English";
      
      if (room.secretWord.toLowerCase() === guess.toLowerCase()) {
        evaluateAndApplyGuess(roomId, socket.id, guess, 100);
        return;
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Rate the semantic similarity between the secret word '${room.secretWord}' and the guessed word '${guess}' in ${langPrompt} on a scale of 0 to 100. 100 means they are the exact same word or very close synonyms. 0 means completely unrelated. Return ONLY an integer number.`,
      });
      const scoreStr = response.text?.trim() || "0";
      const score = parseInt(scoreStr, 10);
      const finalScore = isNaN(score) ? 0 : Math.min(100, Math.max(0, score));
      
      evaluateAndApplyGuess(roomId, socket.id, guess, finalScore);
    } catch (error) {
      console.error("Evaluation error:", error);
      evaluateAndApplyGuess(roomId, socket.id, guess, 0);
    }
  });

  function evaluateAndApplyGuess(roomId: string, playerId: string, guess: string, similarity: number) {
    const room = rooms[roomId];
    if (!room || room.status !== "playing") return;

    const player = room.players[playerId];
    if (!player) return;
    
    player.guesses.push({ word: guess, similarity });
    player.guesses.sort((a, b) => b.similarity - a.similarity);
    
    // Award points based on similarity
    if (similarity === 100) {
      player.score += 1000;
      room.status = "finished";
      io.to(roomId).emit("gameOver", { winner: player.name, word: room.secretWord });
    } else if (similarity > 80) {
      player.score += 100;
    } else if (similarity > 50) {
      player.score += 50;
    } else if (similarity > 20) {
      player.score += 10;
    }

    io.to(playerId).emit("guessResult", { similarity });
    io.to(roomId).emit("roomUpdated", room);
  }



  socket.on("buyPowerup", (roomId: string, powerupId: string) => {
    const room = rooms[roomId];
    if (!room) return;
    const player = room.players[socket.id];
    if (!player) return;

    if (powerupId === "hint_small" && player.score >= 100) {
      player.score -= 100;
      const msg = room.language === "pt-BR" ? `A palavra começa com '${room.secretWord[0]}'` : `The word starts with '${room.secretWord[0]}'`;
      socket.emit("powerupResult", { type: "hint_small", message: msg });
      io.to(roomId).emit("roomUpdated", room);
    } else if (powerupId === "hint_big" && player.score >= 300) {
      player.score -= 300;
      const msg = room.language === "pt-BR" ? `A palavra tem ${room.secretWord.length} letras e termina com '${room.secretWord[room.secretWord.length - 1]}'` : `The word has ${room.secretWord.length} letters and ends with '${room.secretWord[room.secretWord.length - 1]}'`;
      socket.emit("powerupResult", { type: "hint_big", message: msg });
      io.to(roomId).emit("roomUpdated", room);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        if (Object.keys(room.players).length === 0) {
          delete rooms[roomId];
        } else {
          if (room.hostId === socket.id) {
            room.hostId = Object.keys(room.players)[0];
          }
          io.to(roomId).emit("roomUpdated", room);
        }
      }
    }
  });
});

async function startServer() {
  const PORT = process.env.PORT || 3000;

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
