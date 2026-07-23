import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupFoundryMocks, setMockSetting, createMockSound, createMockPlaylist } from './mocks/foundry.mjs';

setupFoundryMocks();

import { MusicController } from '../scripts/music-controller.mjs';

describe('MusicController', () => {
  let controller;

  beforeEach(() => {
    setupFoundryMocks();
    controller = new MusicController();
  });

  describe('currentTrack getter', () => {
    it('returns first element of currentTracks array', () => {
      const track1 = createMockSound('t1', 'Track 1');
      const track2 = createMockSound('t2', 'Track 2');
      controller.currentTracks = [track1, track2];

      expect(controller.currentTrack).toBe(track1);
    });

    it('returns null when currentTracks is empty', () => {
      controller.currentTracks = [];
      expect(controller.currentTrack).toBeNull();
    });
  });

  describe('isAudioLocked', () => {
    it('returns true when game.audio.locked is true', () => {
      game.audio = { locked: true };
      expect(controller.isAudioLocked()).toBe(true);
    });

    it('returns false when game.audio.locked is false', () => {
      game.audio = { locked: false };
      expect(controller.isAudioLocked()).toBe(false);
    });

    it('returns false when game.audio is undefined', () => {
      delete game.audio;
      expect(controller.isAudioLocked()).toBe(false);
    });
  });

  describe('filterPlaylists', () => {
    it('rejects combat context when combat is not started', () => {
      game.combats = { active: { started: false } };
      const ctx = { context: 'combat' };
      expect(controller.filterPlaylists(ctx)).toBe(false);
    });

    it('rejects combat context when suppressCombat setting is true', () => {
      game.combats = { active: { started: true } };
      setMockSetting('vgmusic', 'suppressCombat', true);
      const ctx = { context: 'combat' };
      expect(controller.filterPlaylists(ctx)).toBe(false);
    });

    it('rejects area context when suppressArea setting is true', () => {
      setMockSetting('vgmusic', 'suppressArea', true);
      const ctx = { context: 'area' };
      expect(controller.filterPlaylists(ctx)).toBe(false);
    });

    it('accepts combat context when combat started and not suppressed', () => {
      game.combats = { active: { started: true } };
      setMockSetting('vgmusic', 'suppressCombat', false);
      const ctx = { context: 'combat' };
      expect(controller.filterPlaylists(ctx)).toBe(true);
    });

    it('accepts area context when not suppressed', () => {
      setMockSetting('vgmusic', 'suppressArea', false);
      const ctx = { context: 'area' };
      expect(controller.filterPlaylists(ctx)).toBe(true);
    });
  });

  describe('sortPlaylists', () => {
    it('prioritizes context entity matching current combatant token', () => {
      const token = { id: 'tok1' };
      const combat = { combatant: { token } };
      const ctxA = { contextEntity: token, priority: 0 };
      const ctxB = { contextEntity: {}, priority: 10 };

      expect(controller.sortPlaylists(ctxA, ctxB, combat)).toBe(-1);
    });

    it('prioritizes context entity matching current combatant actor', () => {
      const actor = { id: 'act1' };
      const combat = { combatant: { actor } };
      const ctxA = { contextEntity: {}, priority: 10 };
      const ctxB = { contextEntity: actor, priority: 0 };

      expect(controller.sortPlaylists(ctxA, ctxB, combat)).toBe(1);
    });

    it('sorts by descending priority when neither matches current combatant', () => {
      const combat = { combatant: null };
      const ctxA = { contextEntity: {}, priority: 5 };
      const ctxB = { contextEntity: {}, priority: 15 };

      expect(controller.sortPlaylists(ctxA, ctxB, combat)).toBe(10); // 15 - 5 > 0 => b comes before a
    });
  });

  describe('_getCombatantMusicSource', () => {
    it('returns null when both token and actor are null', () => {
      expect(controller._getCombatantMusicSource(null, null)).toBeNull();
    });

    it('linked + useTokenMusic=true: returns token', () => {
      const token = { actorLink: true, getFlag: () => true };
      const actor = { id: 'act1' };

      expect(controller._getCombatantMusicSource(token, actor)).toBe(token);
    });

    it('linked + useTokenMusic=false: returns actor', () => {
      const token = { actorLink: true, getFlag: () => false };
      const actor = { id: 'act1' };

      expect(controller._getCombatantMusicSource(token, actor)).toBe(actor);
    });

    it('unlinked: returns token', () => {
      const token = { actorLink: false };
      const actor = { id: 'act1' };

      expect(controller._getCombatantMusicSource(token, actor)).toBe(token);
    });

    it('unlinked + no token: returns prototypeToken', () => {
      const protoToken = { id: 'proto1' };
      const actor = { prototypeToken: protoToken };

      expect(controller._getCombatantMusicSource(null, actor)).toBe(protoToken);
    });

    it('unlinked + no token + no prototypeToken: returns actor', () => {
      const actor = { id: 'act1' };
      expect(controller._getCombatantMusicSource(null, actor)).toBe(actor);
    });
  });

  describe('playTrack', () => {
    it('does nothing for null/undefined sound', async () => {
      await expect(controller.playTrack(null)).resolves.toBeUndefined();
    });

    it('calls parent.playSound when available', async () => {
      const sound = createMockSound('s1', 'Sound 1');
      await controller.playTrack(sound);
      expect(sound.parent.playSound).toHaveBeenCalledWith(sound);
    });

    it('falls back to sound.play() when parent.playSound is missing', async () => {
      const sound = createMockSound('s1', 'Sound 1', { parent: null });
      await controller.playTrack(sound);
      expect(sound.play).toHaveBeenCalled();
    });

    it('silently swallows AbortError exceptions', async () => {
      const abortError = new Error('The play request was interrupted');
      abortError.name = 'AbortError';
      const sound = createMockSound('s1', 'Sound 1', {
        parent: { playSound: vi.fn().mockRejectedValue(abortError) }
      });

      await expect(controller.playTrack(sound)).resolves.toBeUndefined();
    });
  });

  describe('stopTrack', () => {
    it('does nothing for null/undefined sound', () => {
      expect(() => controller.stopTrack(null)).not.toThrow();
    });

    it('calls parent.stopSound when available', () => {
      const sound = createMockSound('s1', 'Sound 1');
      controller.stopTrack(sound);
      expect(sound.parent.stopSound).toHaveBeenCalledWith(sound);
    });

    it('falls back to sound.sound.stop() when parent is missing', () => {
      const sound = createMockSound('s1', 'Sound 1', { parent: null });
      controller.stopTrack(sound);
      expect(sound.sound.stop).toHaveBeenCalled();
    });
  });

  describe('savePlaylistData / getPlaylistData', () => {
    it('saves and retrieves offset keyed by entity + soundId', () => {
      const entity = { documentName: 'Scene', id: 'sc1', name: 'Scene 1' };
      const sound = createMockSound('s1', 'Track 1', { sound: { currentTime: 45.5 } });

      controller.savePlaylistData(entity, sound);
      const savedOffset = controller.getPlaylistData(entity, sound);

      expect(savedOffset).toBe(45.5);
    });

    it('returns 0 for entity/sound with no saved data', () => {
      const entity = { documentName: 'Scene', id: 'sc1' };
      const sound = createMockSound('s1', 'Track 1');

      expect(controller.getPlaylistData(entity, sound)).toBe(0);
    });

    it('returns 0 when entity or sound is null', () => {
      expect(controller.getPlaylistData(null, null)).toBe(0);
      expect(controller.getPlaylistData({}, null)).toBe(0);
    });

    it('evicts oldest entry when cache exceeds 50 entities', () => {
      const sound = createMockSound('s1', 'Track 1', { sound: { currentTime: 10 } });

      for (let i = 1; i <= 52; i++) {
        const entity = { documentName: 'Scene', id: `sc_${i}` };
        controller.savePlaylistData(entity, sound);
      }

      // First entry sc_1 should have been evicted
      const firstEntity = { documentName: 'Scene', id: 'sc_1' };
      const lastEntity = { documentName: 'Scene', id: 'sc_52' };

      expect(controller.getPlaylistData(firstEntity, sound)).toBe(0);
      expect(controller.getPlaylistData(lastEntity, sound)).toBe(10);
    });
  });
});
