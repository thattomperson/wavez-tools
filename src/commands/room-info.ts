import { formatDuration } from '../lib/format';
import { requireState } from '../wavez/bridge';
import type { Command } from './types';

export const roomInfo: Command = {
  label: 'Room info',
  run({ show }) {
    const { room, queue, playback, votes, currentUser } = requireState();
    const me = currentUser && queue.entries.find((e) => e.userId === currentUser.id);
    const you = me
      ? `You: #${me.position} in queue, ETA ${formatDuration(me.estimatedWaitMs)}`
      : queue.isCurrentDj
        ? 'You: DJing now'
        : 'You: not in queue';
    show([
      `${room.name} (/${room.slug})`,
      `Users: ${room.activeUsersCount}  Queue: ${queue.count}${queue.isLocked ? ' (locked)' : ''}`,
      playback
        ? `Playing: ${playback.artist ? `${playback.artist} - ` : ''}${playback.title} [${formatDuration(playback.durationMs)}]`
        : 'Nothing playing',
      playback && `DJ: ${playback.djUsername}`,
      `Votes: ${votes.woots} woot / ${votes.mehs} meh / ${votes.grabs} grab`,
      you,
    ]);
  },
};
