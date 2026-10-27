import { formatAgo, formatDuration } from '../lib/format';
import type { NextSongState } from '../wavez/next-song';
import { trackArtist, trackLink, trackTitle } from '../wavez/tracks';
import { banner, button, message, stats } from '../ui/components';
import { h } from '../ui/dom';
import type { ScreenTool } from './types';

export const nextSongDetails: ScreenTool = {
  kind: 'screen',
  name: 'Next song details',
  blurb: 'Play counts and last played for the next song',
  glyph: 'S',
  open({ body, setSubtitle, signal, nextSong }) {
    const render = (state: NextSongState) => {
      setSubtitle(state.playlist ? `Up next · ${state.playlist.name}` : 'Up next');
      const { track } = state;
      const head =
        track &&
        h(
          'div',
          { class: 'wt-track-head' },
          h('a', { href: trackLink(track), target: '_blank', rel: 'noopener' }, trackTitle(track)),
          h('span', { class: 'wt-muted' }, [trackArtist(track), formatDuration(track.durationMs)].filter(Boolean).join(' · ')),
        );
      const recheck = button('Recheck', () => nextSong.refresh(), { disabled: state.status === 'loading' });

      if (state.status === 'loading') {
        body.replaceChildren(h('div', { class: 'wt-body' }, head, message('Checking with the bot…'), recheck));
        return;
      }
      if (state.status === 'failed') {
        body.replaceChildren(h('div', { class: 'wt-body' }, head, banner('err', state.error), recheck));
        return;
      }
      const { result } = state;
      const { plays } = result;
      const verdict = result.blocked
        ? banner('op', h('b', null, 'Blocked.'), result.reason ? ` ${result.reason}` : '')
        : result.op
          ? banner('op', h('b', null, 'Overplayed.'), result.reason ? ` ${result.reason}` : '')
          : banner('ok', h('b', null, 'Not overplayed.'), result.reason ? ` ${result.reason}` : '');
      body.replaceChildren(
        h(
          'div',
          { class: 'wt-body' },
          head,
          verdict,
          stats([
            { value: plays.day, label: 'today', hot: result.op },
            { value: plays.week, label: 'week' },
            { value: plays.month, label: 'month' },
            { value: plays.all, label: 'all time' },
          ]),
          h(
            'div',
            { class: 'wt-muted' },
            `Last played ${formatAgo(result.lastPlayed)}`,
            result.label ? ` · ${result.label}` : '',
          ),
          recheck,
        ),
      );
    };
    render(nextSong.get());
    const unsubscribe = nextSong.subscribe(render);
    signal.addEventListener('abort', unsubscribe);
  },
};
