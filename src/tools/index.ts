import { autoMoveOp } from './auto-move-op';
import { autoJoin, autoLeave } from './auto-queue';
import { autoWoot } from './auto-woot';
import { nextSongDetails } from './next-song';
import { playlistInfo } from './playlist-info';
import { queueCheck } from './queue-check';
import { roomInfo } from './room-info';
import type { Tool } from './types';

export type { ScreenContext, ScreenTool, ToggleContext, ToggleTool, Tool } from './types';

// Tools appear in the panel's list in this order; toggles go under a divider.
export const tools: Tool[] = [queueCheck, nextSongDetails, roomInfo, playlistInfo, autoWoot, autoMoveOp, autoJoin, autoLeave];
