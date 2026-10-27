import { formatDuration } from '../lib/format';
import { requireBridge, requireState, type RoomEvent } from '../wavez/bridge';
import { keyValues } from '../ui/components';
import { h } from '../ui/dom';
import type { ScreenTool } from './types';

const LIVE_EVENTS: RoomEvent[] = ['room_changed', 'playback_changed', 'votes_changed', 'queue_changed', 'users_changed'];

export const roomInfo: ScreenTool = {
  kind: 'screen',
  name: 'Room info',
  blurb: 'Users, queue, current track, your position',
  glyph: 'R',
  open({ body, setSubtitle, signal }) {
    const render = () => {
      const { room, queue, playback, votes, currentUser } = requireState();
      const me = currentUser && queue.entries.find((e) => e.userId === currentUser.id);
      setSubtitle(`${room.name} · /${room.slug}`);
      body.replaceChildren(
        h(
          'div',
          { class: 'wt-body' },
          keyValues([
            ['Users', String(room.activeUsersCount)],
            ['Queue', `${queue.count}${queue.isLocked ? ' (locked)' : ''}`],
            [
              'Playing',
              playback
                ? `${playback.artist ? `${playback.artist} - ` : ''}${playback.title} [${formatDuration(playback.durationMs)}]`
                : 'Nothing',
            ],
            playback && ['DJ', playback.djUsername],
            ['Votes', `${votes.woots} woot · ${votes.mehs} meh · ${votes.grabs} grab`],
            [
              'You',
              me
                ? `#${me.position} in queue, ETA ${formatDuration(me.estimatedWaitMs)}`
                : queue.isCurrentDj
                  ? 'DJing now'
                  : 'Not in queue',
            ],
          ]),
        ),
      );
    };
    render();
    const bridge = requireBridge();
    const stops = LIVE_EVENTS.map((event) => bridge.room.subscribe(event, render));
    signal.addEventListener('abort', () => stops.forEach((stop) => stop()));
  },
};
