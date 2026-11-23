// The features shown on the GitHub Pages site (built into dist/index.html by
// scripts/build.mjs). Each one has a screenshot in site/screenshots/, taken by
// `npm run screenshots` (scripts/screenshots/run.mjs) from the real panel with
// made-up room data.
//
// When you add or change a tool, update its entry here (and its screenshot)
// in the same PR. `body` is HTML; keep it to a short paragraph or two in plain
// words, like the README.

export const groups = [
  {
    title: 'Always in view',
    features: [
      {
        name: 'Next song and opcheck',
        image: 'panel.png',
        alt: 'The WavezFM Tools panel: the next song with an OK chip in the header, then the list of tools and switches',
        body: `<p>The top of the panel always shows the next song in your active playlist and whether the
          room bot says it's overplayed (OP). It checks again whenever the song changes. Click the
          song for the details, or collapse the panel down to just that line.</p>
          <p>Drag the grip on the left to move the panel anywhere. It remembers where you left it.</p>`,
      },
      {
        name: 'Next song details',
        image: 'opcheck-op.png',
        alt: 'Next song details screen showing an Overplayed warning, play counts for today, this week, this month and all time, and when it was last played',
        body: `<p>Play counts for today, this week, this month and all time, when it was last played, and
          why the bot says it's OP. Hit <b>Recheck</b> to ask again.</p>`,
      },
    ],
  },
  {
    title: 'Screens',
    features: [
      {
        name: 'Queue check',
        image: 'queue-check.png',
        alt: 'Queue check screen listing the next 10 songs, two marked OP, with a Move 2 to end button',
        body: `<p>Opchecks the next 10 songs in your playlist in one go, then moves the OP ones to the end
          with one click.</p>`,
      },
      {
        name: 'Room info',
        image: 'room-info.png',
        alt: 'Room info screen with users, queue, current track, DJ, votes and your queue position',
        body: `<p>Who's here, how long the queue is, what's playing and who's DJing, the votes so far,
          and where you are in the queue with an estimated wait.</p>`,
      },
      {
        name: 'Playlist info',
        image: 'playlist-info.png',
        alt: 'Playlist info screen with the active playlist name, its length and the first tracks',
        body: `<p>Your active playlist: how many songs it has, how long it runs, and what's coming up first.</p>`,
      },
    ],
  },
  {
    title: 'Switches',
    intro: `Switches keep running while the panel is open and are remembered for next time. The cog next to
      a switch opens its settings.`,
    features: [
      {
        name: 'AutoWoot',
        body: `<p>Woots every song for you.</p>`,
      },
      {
        name: 'Auto-move OP songs',
        body: `<p>Whenever your next song is OP, it moves it to the end of the playlist so you never play
          something the room's heard too much. A long run of OP songs gets worked through all the way, a little slower after the first 10.</p>`,
      },
      {
        name: 'Playlist rotation',
        image: 'playlist-rotation.png',
        alt: 'Playlist rotation settings: three playlists ticked, the status line reading 6 songs left in Lofi 1, then Lofi 2',
        body: `<p>WavezFM caps a playlist at 500 songs, so a big library ends up split across several. Tick
          the playlists to rotate through and it works through them one after another, in your WavezFM
          playlist order. Once the song you started a playlist on comes round again, the next playlist
          becomes active.</p>
          <p>It works with Auto-move OP songs: songs moved to the end still count as played through.
          The line under the name says how many songs are left before it switches.</p>`,
      },
      {
        name: 'Auto-join',
        image: 'auto-join.png',
        alt: 'Auto-join settings: join the queue when fewer than 3 people are waiting',
        body: `<p>Joins the DJ queue for you when fewer than a set number of other people are waiting (by
          default, only when nobody else is). With Auto-leave on, it stays under Auto-leave's number so
          the two never join and leave over and over.</p>`,
      },
      {
        name: 'Removed from the queue? Auto-join backs off',
        image: 'auto-join-removed.png',
        alt: 'Auto-join switched off with the note: Off, you were removed from the queue',
        body: `<p>If someone else, like a mod, takes you out of the queue, Auto-join switches itself off
          instead of putting you straight back, and says why. Leaving yourself doesn't count.</p>`,
      },
      {
        name: 'Auto-leave',
        image: 'auto-leave.png',
        alt: 'Auto-leave settings: leave when 3 people are waiting, after my next 2 plays, or after 1 hour 30 minutes, and also turn off Auto-join',
        body: `<p>Leaves the DJ queue when one of your rules hits: when enough people are waiting, after
          your next few plays, or on a sleep timer. It never leaves in the middle of your song, and can
          switch Auto-join off too so you don't rejoin. The line under the name counts down what
          happens next.</p>`,
      },
      {
        name: 'Notifications',
        image: 'notifications.png',
        alt: 'Notifications settings: desktop notification, sound with a volume slider, and what to notify about, including other words tom, ttp, thomas',
        body: `<p>Tells you when a chat message is for you: your @name, replies to your messages,
          <code>@staff</code>, <code>@everyone</code>, room bot messages, or any other words you pick.
          Choose a desktop notification, a sound, or both, and have the sound play only while you're
          in another tab.</p>`,
      },
      {
        name: 'Voice & video',
        image: 'voice-call.png',
        alt: 'The call popup next to the chat, showing two people already in the call, with Join voice and With camera buttons',
        body: `<p>A call popup next to the chat for a voice or video call with everyone in the room who has
          the switch on. See who's in before you join, share your screen, pick your mic and camera, and
          shrink it to a small pill when you just want to listen.</p>`,
      },
    ],
  },
  {
    title: 'Chat commands',
    features: [
      {
        name: '/wt commands',
        image: 'chat-commands.png',
        alt: 'The answer to /wt status shown in a small note above the chat box, listing which switches are on',
        body: `<p>Flip switches and check things without opening the panel by typing into the room chat.
          Commands are never posted to the room; the answer pops up above the chat box. They work in
          the pop-out chat too.</p>
          <p><code>/wt status</code>, <code>/wt next</code>, <code>/wt autojoin on</code>,
          <code>/wt rotate off</code>, <code>/wt notify test</code>, <code>/wt help</code> for the rest.</p>`,
      },
    ],
  },
];
