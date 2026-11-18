// Room bot that answers opcheck commands. Find these values in the
// send_bot_command packet the site sends when you use the bot.
export const OPCHECK_BOT = {
  botUserId: 'room-bot:d1823015-3697-4a19-8107-c260d7769613',
  /** Prefix the bot expects before a command, e.g. "tpq opcheck <link>". */
  commandPrefix: 'tpq',
};

// Voice & video calls (src/tools/voice-call.tsx). tokenUrl is the Cloudflare
// Worker in server/call-token that signs LiveKit join tokens; see its README.
// Empty means calls aren't set up, and the popup says so.
export const CALL = {
  tokenUrl: 'https://wavez-tools-call-token.ttp.workers.dev',
};
