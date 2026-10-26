import { nextSong } from './next-song';
import { opcheckNextSong } from './opcheck';
import { playlistInfo } from './playlist-info';
import { roomInfo } from './room-info';
import type { Command } from './types';

export type { Command, CommandContext } from './types';

// Buttons appear in the panel in this order.
export const commands: Command[] = [opcheckNextSong, nextSong, roomInfo, playlistInfo];
