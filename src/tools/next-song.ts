import { formatAgo, formatDuration } from '../lib/format';
import { computed } from '@preact/signals-core';
import { trackArtist, trackLink, trackTitle } from '../wavez/tracks';
import { banner, button, message, stats } from '../ui/components';
import { h, watch } from '../ui/dom';
import type { ScreenTool } from './types';

export const nextSongDetails: ScreenTool = {
  kind: 'screen',
  name: 'Next song details',
  blurb: 'Play counts and last played for the next song',
  glyph: 'S',
  open({ body, setSubtitle, nextSong }) {
    // Only the part that depends on what changed is redrawn: the track line when
    // the track changes, the verdict when the check comes back.
    const track = computed(() => nextSong.value.track);
    const status = computed(() => nextSong.value.status);
    watch(() => {
      const { playlist } = nextSong.value;
      setSubtitle(playlist ? `Up next · ${playlist.name}` : 'Up next');
    });

    const head = () => {
      const t = track.value;
      return (
        t &&
        h(
          'div',
          { class: 'wt-track-head' },
          h('a', { href: trackLink(t), target: '_blank', rel: 'noopener' }, trackTitle(t)),
          h('span', { class: 'wt-muted' }, [trackArtist(t), formatDuration(t.durationMs)].filter(Boolean).join(' · ')),
        )
      );
    };

    const details = () => {
      const state = nextSong.value;
      if (state.status === 'loading') return message('Checking with the bot…');
      if (state.status === 'failed') return banner('err', state.error);
      const { result } = state;
      const { plays } = result;
      const verdict = result.blocked
        ? banner('op', h('b', null, 'Blocked.'), result.reason ? ` ${result.reason}` : '')
        : result.op
          ? banner('op', h('b', null, 'Overplayed.'), result.reason ? ` ${result.reason}` : '')
          : banner('ok', h('b', null, 'Not overplayed.'), result.reason ? ` ${result.reason}` : '');
      return [
        verdict,
        stats([
          { value: plays.day, label: 'today', hot: result.op },
          { value: plays.week, label: 'week' },
          { value: plays.month, label: 'month' },
          { value: plays.all, label: 'all time' },
        ]),
        h('div', { class: 'wt-muted' }, `Last played ${formatAgo(result.lastPlayed)}`, result.label ? ` · ${result.label}` : ''),
      ];
    };

    body.replaceChildren(
      h(
        'div',
        { class: 'wt-body' },
        head,
        details,
        button('Recheck', () => nextSong.refresh(), { disabled: computed(() => status.value === 'loading') }),
      ),
    );
  },
};
