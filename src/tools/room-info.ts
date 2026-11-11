import { formatDuration } from '../lib/format';
import { computed, signal as signal$ } from '@preact/signals-core';
import { getState, requireBridge, requireState, type RoomEvent, type RoomState } from '../wavez/bridge';
import { h, watch, type Child } from '../ui/dom';
import type { ScreenTool } from './types';

const LIVE_EVENTS: RoomEvent[] = ['room_changed', 'playback_changed', 'votes_changed', 'queue_changed', 'users_changed'];

export const roomInfo: ScreenTool = {
  kind: 'screen',
  name: 'Room info',
  blurb: 'Users, queue, current track, your position',
  glyph: 'R',
  open({ body, setSubtitle, signal }) {
    // One signal for the room; each line below only redraws when its own text changes.
    const state = signal$(requireState());
    const line = (fn: (s: RoomState) => string) => computed(() => fn(state.value));
    const playing = computed(() => !!state.value.playback);
    const row = (label: string, value: Child) => [h('dt', null, label), h('dd', null, value)];

    body.replaceChildren(
      h(
        'div',
        { class: 'wt-body' },
        h(
          'dl',
          { class: 'wt-kv' },
          row('Users', line((s) => String(s.room.activeUsersCount))),
          row('Queue', line(({ queue }) => `${queue.count}${queue.isLocked ? ' (locked)' : ''}`)),
          row(
            'Playing',
            line(({ playback }) =>
              playback
                ? `${playback.artist ? `${playback.artist} - ` : ''}${playback.title} [${formatDuration(playback.durationMs)}]`
                : 'Nothing',
            ),
          ),
          () => playing.value && row('DJ', line((s) => s.playback?.djUsername ?? '')),
          row('Votes', line(({ votes }) => `${votes.woots} woot · ${votes.mehs} meh · ${votes.grabs} grab`)),
          row(
            'You',
            line(({ queue, currentUser }) => {
              const me = currentUser && queue.entries.find((e) => e.userId === currentUser.id);
              if (me) return `#${me.position} in queue, ETA ${formatDuration(me.estimatedWaitMs)}`;
              return queue.isCurrentDj ? 'DJing now' : 'Not in queue';
            }),
          ),
        ),
      ),
    );
    watch(() => {
      const { room } = state.value;
      setSubtitle(`${room.name} · /${room.slug}`);
    });

    const bridge = requireBridge();
    const stops = LIVE_EVENTS.map((event) =>
      bridge.room.subscribe(event, () => {
        const next = getState();
        // A fresh object, so the signal sees a change even if the bridge reuses its state.
        if (next) state.value = { ...next };
      }),
    );
    signal.addEventListener('abort', () => stops.forEach((stop) => stop()));
  },
};
