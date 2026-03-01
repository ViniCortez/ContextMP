/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { motion, AnimatePresence } from "motion/react";
import { Copy, Play, Sparkles, Globe, Volume2, VolumeX, Music, ShieldAlert } from "lucide-react";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";
import { audio } from "./audio";

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// Types
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

const t = {
  en: {
    title: "Context Multiplayer",
    subtitle: "Guess the secret word based on semantic similarity.",
    yourName: "Your Name",
    enterName: "Enter your name",
    createGame: "Create New Game",
    orJoin: "or join existing",
    join: "Join",
    waiting: "Waiting for players...",
    shareCode: "Share the room code",
    orInvite: "or the invite link with your friends to play.",
    startGame: "Start Game",
    waitingHost: "Waiting for host to start...",
    typeGuess: "Type a word below to start guessing!",
    placeholder: "Type your guess...",
    guessBtn: "Guess",
    leaderboard: "Leaderboard",
    powerups: "Power-ups",
    smallHint: "Small Hint",
    smallHintDesc: "First letter",
    bigHint: "Big Hint",
    bigHintDesc: "Length & last letter",
    activeHints: "Active Hints",
    room: "Room:",
    pts: "pts",
    gameOver: "Game Over!",
    guessedWord: "guessed the word:",
    inviteCopied: "Invite link copied!",
    enterNameAlert: "Please enter your name",
    enterRoomAlert: "Please enter a room ID",
    roomNotFound: "Room not found",
    language: "Language",
    adblockTitle: "Adblocker Detected",
    adblockMsg: "Please disable your adblocker to play the game. We rely on ads to keep the servers running and the AI API paid.",
    adblockBtn: "I have disabled it",
  },
  "pt-BR": {
    title: "Contexto Multiplayer",
    subtitle: "Adivinhe a palavra secreta com base na similaridade semântica.",
    yourName: "Seu Nome",
    enterName: "Digite seu nome",
    createGame: "Criar Novo Jogo",
    orJoin: "ou entrar em um existente",
    join: "Entrar",
    waiting: "Aguardando jogadores...",
    shareCode: "Compartilhe o código da sala",
    orInvite: "ou o link de convite com seus amigos para jogar.",
    startGame: "Iniciar Jogo",
    waitingHost: "Aguardando o host iniciar...",
    typeGuess: "Digite uma palavra abaixo para começar a adivinhar!",
    placeholder: "Digite seu palpite...",
    guessBtn: "Adivinhar",
    leaderboard: "Placar",
    powerups: "Poderes",
    smallHint: "Dica Pequena",
    smallHintDesc: "Primeira letra",
    bigHint: "Dica Grande",
    bigHintDesc: "Tamanho e última letra",
    activeHints: "Dicas Ativas",
    room: "Sala:",
    pts: "pts",
    gameOver: "Fim de Jogo!",
    guessedWord: "adivinhou a palavra:",
    inviteCopied: "Link de convite copiado!",
    enterNameAlert: "Por favor, digite seu nome",
    enterRoomAlert: "Por favor, digite o ID da sala",
    roomNotFound: "Sala não encontrada",
    language: "Idioma",
    adblockTitle: "Bloqueador de Anúncios Detectado",
    adblockMsg: "Por favor, desative seu bloqueador de anúncios para jogar. Nós dependemos dos anúncios para manter os servidores online e a inteligência artificial funcionando.",
    adblockBtn: "Eu já desativei",
  }
};

let socket: Socket;

export default function App() {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [guess, setGuess] = useState("");
  const [hints, setHints] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState<"en" | "pt-BR">("en");
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const [adBlockDetected, setAdBlockDetected] = useState(false);

  useEffect(() => {
    const checkAdBlocker = async () => {
      try {
        await fetch(
          new Request("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js", {
            method: 'HEAD',
            mode: 'no-cors',
            cache: 'no-store'
          })
        );

        // Also check via DOM element (catches cosmetic filters)
        const bait = document.createElement('div');
        bait.className = 'adsbox ad-placement doubleclick ad-placeholder ad-badge';
        bait.style.position = 'absolute';
        bait.style.left = '-999px';
        bait.style.height = '10px';
        document.body.appendChild(bait);

        setTimeout(() => {
          if (bait.offsetHeight === 0 || window.getComputedStyle(bait).display === 'none') {
            setAdBlockDetected(true);
          }
          bait.remove();
        }, 300);
      } catch (error) {
        setAdBlockDetected(true);
      }
    };

    checkAdBlocker();
  }, []);

  useEffect(() => {
    audio.setMusicEnabled(musicEnabled);
  }, [musicEnabled]);

  useEffect(() => {
    audio.setSfxEnabled(sfxEnabled);
  }, [sfxEnabled]);

  useEffect(() => {
    const handleFirstInteraction = () => {
      audio.init();
      if (musicEnabled) audio.startMusic();
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };

    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('keydown', handleFirstInteraction);

    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, [musicEnabled]);

  useEffect(() => {
    // Initialize socket connection
    socket = io();

    socket.on("roomUpdated", (updatedRoom: Room) => {
      setRoom(updatedRoom);
    });

    socket.on("gameStarted", () => {
      setHints([]);
      setGuess("");
    });

    socket.on("gameOver", ({ winner, word }) => {
      const currentLang = room?.language || language;
      alert(`${t[currentLang].gameOver} ${winner} ${t[currentLang].guessedWord} ${word}`);
    });

    socket.on("powerupResult", ({ type, message }) => {
      setHints((prev) => [...prev, message]);
    });

    socket.on("guessResult", ({ similarity }) => {
      if (similarity === 100) {
        audio.playSfx('win');
      } else if (similarity > 50) {
        audio.playSfx('chime');
      } else {
        audio.playSfx('thud');
      }
    });



    // Check URL for room ID
    const urlParams = new URLSearchParams(window.location.search);
    const urlRoomId = urlParams.get("room");
    if (urlRoomId) {
      setRoomId(urlRoomId);
    }

    return () => {
      socket.disconnect();
    };
  }, []);

  const createRoom = () => {
    if (!name) return alert(t[language].enterNameAlert);
    socket.emit("createRoom", name, language, (id: string) => {
      setRoomId(id);
      window.history.pushState({}, "", `?room=${id}`);
    });
  };

  const joinRoom = () => {
    if (!name) return alert(t[language].enterNameAlert);
    if (!roomId) return alert(t[language].enterRoomAlert);
    socket.emit("joinRoom", roomId, name, (success: boolean) => {
      if (!success) alert(t[language].roomNotFound);
      else window.history.pushState({}, "", `?room=${roomId}`);
    });
  };

  const startGame = () => {
    socket.emit("startGame", room?.id);
  };

  const submitGuess = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guess.trim() || !room || room.status !== "playing") return;
    socket.emit("guessWord", room.id, guess.trim());
    audio.playSfx('pop');
    setGuess("");
  };

  const buyPowerup = (id: string) => {
    socket.emit("buyPowerup", room?.id, id);
    audio.playSfx('sparkle');
  };

  const copyInviteLink = () => {
    const link = `${window.location.origin}?room=${room?.id}`;
    navigator.clipboard.writeText(link);
    const currentLang = room?.language || language;
    alert(t[currentLang].inviteCopied);
  };

  if (!room) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4 font-sans">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl"
        >
          <h1 className="text-4xl font-bold text-center mb-2 tracking-tight">{t[language].title}</h1>
          <p className="text-zinc-400 text-center mb-8">{t[language].subtitle}</p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">{t[language].yourName}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder={t[language].enterName}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">{t[language].language}</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setLanguage("en")}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-sm font-medium transition-colors border",
                    language === "en" ? "bg-indigo-600 border-indigo-500 text-white" : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                  )}
                >
                  English
                </button>
                <button
                  onClick={() => setLanguage("pt-BR")}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-sm font-medium transition-colors border",
                    language === "pt-BR" ? "bg-indigo-600 border-indigo-500 text-white" : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                  )}
                >
                  Português
                </button>
              </div>
            </div>

            <div className="pt-4 space-y-3">
              <button
                onClick={createRoom}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl px-4 py-3 transition-colors flex items-center justify-center gap-2"
              >
                <Sparkles className="w-5 h-5" />
                {t[language].createGame}
              </button>

              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-zinc-800"></div>
                <span className="flex-shrink-0 mx-4 text-zinc-500 text-sm">{t[language].orJoin}</span>
                <div className="flex-grow border-t border-zinc-800"></div>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  className="flex-grow bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all uppercase"
                  placeholder="ROOM ID"
                  maxLength={6}
                />
                <button
                  onClick={joinRoom}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-xl px-6 py-3 transition-colors"
                >
                  {t[language].join}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  const me = room.players[socket.id];
  const isHost = room.hostId === socket.id;
  const sortedPlayers = Object.values(room.players).sort((a, b) => b.score - a.score);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex flex-col">
      {adBlockDetected && (
        <div className="fixed inset-0 z-50 bg-zinc-950/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-md text-center shadow-2xl">
            <div className="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold mb-4">{t[language].adblockTitle}</h2>
            <p className="text-zinc-400 mb-8 leading-relaxed">
              {t[language].adblockMsg}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl px-6 py-4 transition-colors"
            >
              {t[language].adblockBtn}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold tracking-tight">Context MP</h1>
            <div className="flex items-center gap-2 px-3 py-1 bg-zinc-800 rounded-full text-sm font-mono">
              <span className="text-zinc-400">{t[room.language || language].room}</span>
              <span className="text-indigo-400 font-bold">{room.id}</span>
              <button onClick={copyInviteLink} className="p-1 hover:bg-zinc-700 rounded-full transition-colors ml-1">
                <Copy className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 mr-4 border-r border-zinc-800 pr-4">
              <button
                onClick={() => setMusicEnabled(!musicEnabled)}
                className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-white"
                title={musicEnabled ? "Disable Music" : "Enable Music"}
              >
                {musicEnabled ? <Music className="w-4 h-4" /> : <div className="relative"><Music className="w-4 h-4 opacity-50" /><div className="absolute inset-0 flex items-center justify-center"><div className="w-full h-0.5 bg-red-500 rotate-45"></div></div></div>}
              </button>
              <button
                onClick={() => setSfxEnabled(!sfxEnabled)}
                className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-white"
                title={sfxEnabled ? "Disable SFX" : "Enable SFX"}
              >
                {sfxEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            </div>
            <div className="text-right">
              <div className="text-sm text-zinc-400">{me?.name}</div>
              <div className="font-mono font-bold text-emerald-400">{me?.score || 0} {t[room.language || language].pts}</div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto w-full p-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Leaderboard & Powerups */}
        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              {t[room.language || language].leaderboard}
            </h2>
            <div className="space-y-3">
              {sortedPlayers.map((p, i) => (
                <div key={p.id} className="flex items-center justify-between p-3 bg-zinc-950 rounded-xl border border-zinc-800/50">
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-500 font-mono text-sm">#{i + 1}</span>
                    <span className="font-medium">{p.name} {p.id === socket.id && "(You)"}</span>
                  </div>
                  <span className="font-mono text-emerald-400">{p.score}</span>
                </div>
              ))}
            </div>
          </div>

          {room.status === "playing" && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <h2 className="text-lg font-bold mb-4">{t[room.language || language].powerups}</h2>
              <div className="space-y-3">
                <button
                  onClick={() => buyPowerup("hint_small")}
                  disabled={me.score < 100}
                  className="w-full flex items-center justify-between p-3 bg-zinc-950 rounded-xl border border-zinc-800 hover:border-indigo-500/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="text-left">
                    <div className="font-medium">{t[room.language || language].smallHint}</div>
                    <div className="text-xs text-zinc-500">{t[room.language || language].smallHintDesc}</div>
                  </div>
                  <span className="font-mono text-sm text-emerald-400">100 {t[room.language || language].pts}</span>
                </button>
                <button
                  onClick={() => buyPowerup("hint_big")}
                  disabled={me.score < 300}
                  className="w-full flex items-center justify-between p-3 bg-zinc-950 rounded-xl border border-zinc-800 hover:border-indigo-500/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="text-left">
                    <div className="font-medium">{t[room.language || language].bigHint}</div>
                    <div className="text-xs text-zinc-500">{t[room.language || language].bigHintDesc}</div>
                  </div>
                  <span className="font-mono text-sm text-emerald-400">300 {t[room.language || language].pts}</span>
                </button>
              </div>

              {hints.length > 0 && (
                <div className="mt-6 space-y-2">
                  <h3 className="text-sm font-medium text-zinc-400">{t[room.language || language].activeHints}</h3>
                  {hints.map((hint, i) => (
                    <div key={i} className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 rounded-xl text-sm">
                      {hint}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Persistent Box Ad */}
          <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-4 flex flex-col items-center justify-center min-h-[282px] relative">
            <span className="text-[10px] text-zinc-600 absolute top-2 right-3 uppercase tracking-widest">Advertisement</span>
            <div className="w-full h-full min-h-[250px] mt-4 bg-zinc-950/50 rounded-xl flex items-center justify-center border border-zinc-800/30">
              <span className="text-zinc-700 font-mono">300 x 250</span>
            </div>
          </div>
        </div>

        {/* Main Column: Game Area */}
        <div className="lg:col-span-2 space-y-6">
          {room.status === "lobby" ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
              <h2 className="text-3xl font-bold mb-4">{t[room.language || language].waiting}</h2>
              <p className="text-zinc-400 mb-8 max-w-md">
                {t[room.language || language].shareCode} <strong className="text-white">{room.id}</strong> {t[room.language || language].orInvite}
              </p>
              {isHost ? (
                <button
                  onClick={startGame}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl px-8 py-4 transition-colors flex items-center gap-2 text-lg"
                >
                  <Play className="w-6 h-6" />
                  {t[room.language || language].startGame}
                </button>
              ) : (
                <div className="px-6 py-3 bg-zinc-800 rounded-xl text-zinc-400 animate-pulse">
                  {t[room.language || language].waitingHost}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col h-[600px]">
              <div className="flex-grow overflow-y-auto mb-6 space-y-2 pr-2 custom-scrollbar">
                <AnimatePresence>
                  {me?.guesses.map((g, i) => (
                    <motion.div
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      key={i}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-xl border",
                        g.similarity === 100 ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-200" :
                          g.similarity > 80 ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-200" :
                            g.similarity > 50 ? "bg-blue-500/10 border-blue-500/30 text-blue-200" :
                              "bg-zinc-950 border-zinc-800 text-zinc-300"
                      )}
                    >
                      <span className="font-medium text-lg">{g.word}</span>
                      <div className="flex items-center gap-4">
                        <div className="w-32 h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-1000",
                              g.similarity === 100 ? "bg-emerald-500" :
                                g.similarity > 80 ? "bg-indigo-500" :
                                  g.similarity > 50 ? "bg-blue-500" :
                                    "bg-zinc-600"
                            )}
                            style={{ width: `${g.similarity}%` }}
                          />
                        </div>
                        <span className="font-mono w-8 text-right">{g.similarity}</span>
                      </div>
                    </motion.div>
                  ))}
                  {me?.guesses.length === 0 && (
                    <div className="h-full flex items-center justify-center text-zinc-500">
                      {t[room.language || language].typeGuess}
                    </div>
                  )}
                </AnimatePresence>
              </div>

              <form onSubmit={submitGuess} className="relative">
                <input
                  type="text"
                  value={guess}
                  onChange={(e) => setGuess(e.target.value)}
                  placeholder={t[room.language || language].placeholder}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-6 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all pr-24"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!guess.trim()}
                  className="absolute right-2 top-2 bottom-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-medium rounded-lg px-6 transition-colors"
                >
                  {t[room.language || language].guessBtn}
                </button>
              </form>
            </div>
          )}

          {/* Persistent Rect Ad */}
          <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-4 flex flex-col items-center justify-center h-[122px] relative w-full mt-auto">
            <span className="text-[10px] text-zinc-600 absolute top-2 right-3 uppercase tracking-widest">Advertisement</span>
            <div className="w-full h-full mt-4 bg-zinc-950/50 rounded-xl flex items-center justify-center border border-zinc-800/30">
              <span className="text-zinc-700 font-mono">728 x 90</span>
            </div>
          </div>
        </div>
      </main>

      <style dangerouslySetInnerHTML={{
        __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #3f3f46;
          border-radius: 10px;
        }
      `}} />
    </div>
  );
}
