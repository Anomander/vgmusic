import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupFoundryMocks, setMockSetting, MockDocument, createMockPlaylist, createMockSound } from './mocks/foundry.mjs';

setupFoundryMocks();

import {
  canonicalizeId,
  getFirstAvailableGM,
  isHeadGM,
  getDocumentCategory,
  PlaylistContext,
  FadingTrack,
  log
} from '../scripts/helpers.mjs';

describe('helpers.mjs', () => {
  beforeEach(() => {
    setupFoundryMocks();
  });

  describe('canonicalizeId', () => {
    it('returns empty string for null/undefined/empty input', () => {
      expect(canonicalizeId(null)).toBe('');
      expect(canonicalizeId(undefined)).toBe('');
      expect(canonicalizeId('')).toBe('');
    });

    it('strips "VGMusic.Mood." prefix before canonicalization', () => {
      expect(canonicalizeId('VGMusic.Mood.Calm')).toBe('calm');
    });

    it('strips "VGMusic." prefix before canonicalization', () => {
      expect(canonicalizeId('VGMusic.Tense')).toBe('tense');
    });

    it('lowercases and replaces non-alphanumeric chars with dashes', () => {
      expect(canonicalizeId('Epic Boss Battle!')).toBe('epic-boss-battle');
    });

    it('trims leading and trailing dashes from result', () => {
      expect(canonicalizeId('---Special-Mood---')).toBe('special-mood');
    });
  });

  describe('getDocumentCategory', () => {
    it('returns "Document" for foundry.abstract.Document instances', () => {
      const doc = new MockDocument();
      expect(getDocumentCategory(doc)).toBe('Document');
    });

    it('returns "PrototypeToken" when constructor.name is "PrototypeToken"', () => {
      function PrototypeToken() {}
      const pt = new PrototypeToken();
      expect(getDocumentCategory(pt)).toBe('PrototypeToken');
    });

    it('returns "DefaultMusic" when documentName is "DefaultMusic"', () => {
      const dm = { documentName: 'DefaultMusic' };
      expect(getDocumentCategory(dm)).toBe('DefaultMusic');
    });

    it('returns null for null/undefined input', () => {
      expect(getDocumentCategory(null)).toBeNull();
      expect(getDocumentCategory(undefined)).toBeNull();
    });

    it('returns null for unrecognized object types', () => {
      expect(getDocumentCategory({ foo: 'bar' })).toBeNull();
    });
  });

  describe('getFirstAvailableGM', () => {
    it('returns first active GM sorted alphabetically by id', () => {
      game.users = [
        { id: 'gm2', isGM: true, active: true },
        { id: 'gm1', isGM: true, active: true },
        { id: 'player1', isGM: false, active: true }
      ];

      const firstGM = getFirstAvailableGM();
      expect(firstGM.id).toBe('gm1');
    });

    it('returns null when no GMs are active', () => {
      game.users = [
        { id: 'gm1', isGM: true, active: false },
        { id: 'player1', isGM: false, active: true }
      ];

      expect(getFirstAvailableGM()).toBeNull();
    });
  });

  describe('isHeadGM', () => {
    it('returns true when game.user matches getFirstAvailableGM', () => {
      const gm = { id: 'gm1', isGM: true, active: true };
      game.users = [gm];
      game.user = gm;

      expect(isHeadGM()).toBe(true);
    });

    it('returns false when game.user is not the first active GM', () => {
      const gm1 = { id: 'gm1', isGM: true, active: true };
      const gm2 = { id: 'gm2', isGM: true, active: true };
      game.users = [gm1, gm2];
      game.user = gm2;

      expect(isHeadGM()).toBe(false);
    });
  });

  describe('PlaylistContext._extractSectionConfig', () => {
    it('returns null values for null/undefined section', () => {
      const config = PlaylistContext._extractSectionConfig(null, '');
      expect(config).toEqual({ playlistId: null, trackId: null, priority: 0 });
    });

    it('returns base section values when no mood is active', () => {
      const section = { playlist: 'pl1', initialTrack: 'tr1', priority: 5 };
      const config = PlaylistContext._extractSectionConfig(section, '');
      expect(config).toEqual({ playlistId: 'pl1', trackId: 'tr1', priority: 5 });
    });

    it('returns mood override values when active mood has a playlist', () => {
      const section = {
        playlist: 'base-pl',
        priority: 5,
        moods: {
          boss: { playlist: 'boss-pl', initialTrack: 'boss-tr', priority: 10 }
        }
      };
      const config = PlaylistContext._extractSectionConfig(section, 'boss');
      expect(config).toEqual({ playlistId: 'boss-pl', trackId: 'boss-tr', priority: 10 });
    });

    it('falls back to base section when active mood has no playlist', () => {
      const section = {
        playlist: 'base-pl',
        priority: 5,
        moods: {
          calm: { priority: 2 }
        }
      };
      const config = PlaylistContext._extractSectionConfig(section, 'calm');
      expect(config.playlistId).toBe('base-pl');
    });

    it('falls back to section priority when active mood has no priority specified', () => {
      const section = {
        playlist: 'base-pl',
        priority: 7,
        moods: {
          calm: { playlist: 'calm-pl' }
        }
      };
      const config = PlaylistContext._extractSectionConfig(section, 'calm');
      expect(config.priority).toBe(7);
    });
  });

  describe('PlaylistContext._resolveTracks', () => {
    it('returns empty array when playlist is null', () => {
      const ctx = new PlaylistContext('area', null, null, null);
      expect(ctx.tracks).toEqual([]);
    });

    it('returns specific track when trackId is set and exists', () => {
      const sound1 = createMockSound('tr1', 'Track 1');
      const playlist = createMockPlaylist('pl1', 'Playlist 1', [sound1]);
      const ctx = new PlaylistContext('area', null, playlist, 'tr1');

      expect(ctx.tracks).toEqual([sound1]);
    });

    it('returns empty array when trackId is set but does not exist', () => {
      const playlist = createMockPlaylist('pl1', 'Playlist 1', []);
      const ctx = new PlaylistContext('area', null, playlist, 'nonexistent');

      expect(ctx.tracks).toEqual([]);
    });

    it('SIMULTANEOUS mode: returns all sounds', () => {
      const s1 = createMockSound('s1', 'Sound 1');
      const s2 = createMockSound('s2', 'Sound 2');
      const playlist = createMockPlaylist('pl1', 'Playlist', [s1, s2], 2); // 2 = SIMULTANEOUS
      const ctx = new PlaylistContext('area', null, playlist, null);

      expect(ctx.tracks).toEqual([s1, s2]);
    });

    it('SHUFFLE mode: returns currently playing track if one exists', () => {
      const s1 = createMockSound('s1', 'Sound 1', { playing: false });
      const s2 = createMockSound('s2', 'Sound 2', { playing: true });
      const playlist = createMockPlaylist('pl1', 'Playlist', [s1, s2], 1); // 1 = SHUFFLE
      const ctx = new PlaylistContext('area', null, playlist, null);

      expect(ctx.tracks).toEqual([s2]);
    });

    it('UNSEQUENCED mode: returns empty array', () => {
      const s1 = createMockSound('s1', 'Sound 1');
      const playlist = createMockPlaylist('pl1', 'Playlist', [s1], -1); // -1 = UNSEQUENCED
      const ctx = new PlaylistContext('area', null, playlist, null);

      expect(ctx.tracks).toEqual([]);
    });

    it('SEQUENTIAL mode: returns first track from playbackOrder', () => {
      const s1 = createMockSound('s1', 'Sound 1');
      const s2 = createMockSound('s2', 'Sound 2');
      const playlist = createMockPlaylist('pl1', 'Playlist', [s1, s2], 0); // 0 = SEQUENTIAL
      const ctx = new PlaylistContext('area', null, playlist, null);

      expect(ctx.tracks).toEqual([s1]);
    });
  });

  describe('PlaylistContext.fromDocument', () => {
    it('returns null for null document', () => {
      expect(PlaylistContext.fromDocument(null)).toBeNull();
    });

    it('creates context from Document with getFlag', () => {
      const playlist = createMockPlaylist('pl1', 'Playlist 1', []);
      game.playlists.push(playlist);
      game.playlists.get = vi.fn((id) => (id === 'pl1' ? playlist : null));

      const doc = new MockDocument({
        name: 'Test Scene',
        getFlag: vi.fn((mod, path) => (path === 'music.area' ? { playlist: 'pl1', priority: 5 } : null))
      });

      const ctx = PlaylistContext.fromDocument(doc, 'area', doc);
      expect(ctx).not.toBeNull();
      expect(ctx.playlist).toBe(playlist);
      expect(ctx.priority).toBe(5);
    });

    it('creates context from PrototypeToken', () => {
      const playlist = createMockPlaylist('pl1', 'Playlist 1', []);
      game.playlists.get = vi.fn((id) => (id === 'pl1' ? playlist : null));

      function PrototypeToken() {
        this.flags = { vgmusic: { music: { combat: { playlist: 'pl1', priority: 3 } } } };
      }
      const protoToken = new PrototypeToken();

      const ctx = PlaylistContext.fromDocument(protoToken, 'combat', protoToken);
      expect(ctx).not.toBeNull();
      expect(ctx.playlist).toBe(playlist);
      expect(ctx.priority).toBe(3);
    });

    it('creates context from DefaultMusic configuration object', () => {
      const playlist = createMockPlaylist('pl1', 'Playlist 1', []);
      game.playlists.get = vi.fn((id) => (id === 'pl1' ? playlist : null));

      const defaultDoc = {
        documentName: 'DefaultMusic',
        data: { vgmusic: { music: { area: { playlist: 'pl1', priority: -25 } } } }
      };

      const ctx = PlaylistContext.fromDocument(defaultDoc, 'area', null);
      expect(ctx).not.toBeNull();
      expect(ctx.playlist).toBe(playlist);
      expect(ctx.priority).toBe(-25);
    });

    it('returns null when resolved playlist does not exist', () => {
      game.playlists.get = vi.fn(() => null);
      const doc = new MockDocument({
        name: 'Test Scene',
        getFlag: vi.fn(() => ({ playlist: 'nonexistent' }))
      });

      expect(PlaylistContext.fromDocument(doc, 'area')).toBeNull();
    });
  });

  describe('FadingTrack', () => {
    it('removes itself from controller.fadingTracks after timeout', () => {
      vi.useFakeTimers();
      const mockTrack = createMockSound('tr1', 'Track 1');
      const controller = { fadingTracks: [], currentTrack: null, playCurrentTrack: vi.fn() };
      game.vgmusic = { musicController: controller };

      const fading = new FadingTrack(mockTrack, 100);
      controller.fadingTracks.push(fading);

      expect(controller.fadingTracks).toHaveLength(1);
      vi.advanceTimersByTime(115);
      expect(controller.fadingTracks).toHaveLength(0);

      vi.useRealTimers();
    });

    it('triggers playCurrentTrack when deleted track matches currentTrack', () => {
      vi.useFakeTimers();
      const mockTrack = createMockSound('tr1', 'Track 1');
      const controller = { fadingTracks: [], currentTrack: mockTrack, playCurrentTrack: vi.fn() };
      game.vgmusic = { musicController: controller };

      const fading = new FadingTrack(mockTrack, 100);
      controller.fadingTracks.push(fading);

      vi.advanceTimersByTime(115);
      expect(controller.playCurrentTrack).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });

  describe('log', () => {
    it('always logs level 1 errors to console.error', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      log(1, 'Test error');
      expect(spy).toHaveBeenCalledWith('VGMusic |', 'Test error');
      spy.mockRestore();
    });

    it('logs level 2 warnings to console.warn when enableDebug is true', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      setMockSetting('vgmusic', 'enableDebug', true);
      log(2, 'Test warning');
      expect(spy).toHaveBeenCalledWith('VGMusic |', 'Test warning');
      spy.mockRestore();
    });

    it('gracefully handles settings.get throwing error before initialization', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      game.settings.get.mockImplementationOnce(() => {
        throw new Error('Settings not initialized');
      });

      expect(() => log(3, 'Test msg')).not.toThrow();
      expect(spy).toHaveBeenCalledWith('VGMusic |', 'Test msg');
      spy.mockRestore();
    });

    it('suppresses level 3 logs when enableDebug is false', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      setMockSetting('vgmusic', 'enableDebug', false);
      log(3, 'Debug msg');
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('outputs level 3 logs when enableDebug is true', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      setMockSetting('vgmusic', 'enableDebug', true);
      log(3, 'Debug msg');
      expect(spy).toHaveBeenCalledWith('VGMusic |', 'Debug msg');
      spy.mockRestore();
    });
  });
});
