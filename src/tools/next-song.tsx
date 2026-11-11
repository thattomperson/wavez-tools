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
        t && (
          <div class="wt-track-head">
            <a href={trackLink(t)} target="_blank" rel="noopener">
              {trackTitle(t)}
            </a>
            <span class="wt-muted">{[trackArtist(t), formatDuration(t.durationMs)].filter(Boolean).join(' · ')}</span>
          </div>
        )
      );
    };

    const details = () => {
      const state = nextSong.value;
      if (state.status === 'loading') return message('Checking with the bot…');
      if (state.status === 'failed') return banner('err', state.error);
      const { result } = state;
      const { plays } = result;
      const reason = result.reason ? ` ${result.reason}` : '';
      const verdict = result.blocked
        ? banner('op', <b>Blocked.</b>, reason)
        : result.op
          ? banner('op', <b>Overplayed.</b>, reason)
          : banner('ok', <b>Not overplayed.</b>, reason);
      return [
        verdict,
        stats([
          { value: plays.day, label: 'today', hot: result.op },
          { value: plays.week, label: 'week' },
          { value: plays.month, label: 'month' },
          { value: plays.all, label: 'all time' },
        ]),
        <div class="wt-muted">
          Last played {formatAgo(result.lastPlayed)}
          {result.label ? ` · ${result.label}` : ''}
        </div>,
      ];
    };

    body.replaceChildren(
      <div class="wt-body">
        {head}
        {details}
        {button('Recheck', () => nextSong.refresh(), { disabled: computed(() => status.value === 'loading') })}
      </div>,
    );
  },
};
