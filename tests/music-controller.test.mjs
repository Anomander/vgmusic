import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupFoundryMocks, setMockSetting, createMockSound, createMockPlaylist, MockDocument } from './mocks/foundry.mjs';

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

  describe('playCurrentTrack', () => {
    it('returns early when isDebouncing is true', async () => {
      controller.isDebouncing = true;
      const spy = vi.spyOn(controller, 'getAllCurrentPlaylists');
      await controller.playCurrentTrack();
      expect(spy).not.toHaveBeenCalled();
    });

    it('returns early when current user is not head GM', async () => {
      const gm1 = { id: 'gm1', isGM: true, active: true };
      const gm2 = { id: 'gm2', isGM: true, active: true };
      game.users = [gm1, gm2];
      game.user = gm2;

      const spy = vi.spyOn(controller, 'getAllCurrentPlaylists');
      await controller.playCurrentTrack();
      expect(spy).not.toHaveBeenCalled();
    });

    it('registers unlock listener when game audio is locked', async () => {
      game.audio = { locked: true };
      await controller.playCurrentTrack();

      expect(controller._audioUnlockRegistered).toBe(true);
      expect(globalThis.document.addEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), { once: true });
      expect(globalThis.document.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function), { once: true });
    });

    it('does not re-register unlock listener if already registered', async () => {
      game.audio = { locked: true };
      controller._audioUnlockRegistered = true;
      globalThis.document.addEventListener.mockClear();

      await controller.playCurrentTrack();
      expect(globalThis.document.addEventListener).not.toHaveBeenCalled();
    });

    it('executes context resolution and calls transitionToContext', async () => {
      vi.useFakeTimers();
      const sound1 = createMockSound('s1', 'Sound 1');
      const playlist = createMockPlaylist('p1', 'Playlist 1', [sound1]);
      const targetCtx = { playlist, tracks: [sound1], context: 'area' };

      vi.spyOn(controller, 'getAllCurrentPlaylists').mockReturnValue([targetCtx]);
      vi.spyOn(controller, 'filterPlaylists').mockReturnValue(true);
      const transitionSpy = vi.spyOn(controller, 'transitionToContext').mockResolvedValue();

      await controller.playCurrentTrack();

      expect(transitionSpy).toHaveBeenCalledWith(targetCtx);
      vi.advanceTimersByTime(350);
      expect(controller.isDebouncing).toBe(false);
      vi.useRealTimers();
    });

    it('queues a pending debounced play when called while debouncing', async () => {
      vi.useFakeTimers();
      controller.isDebouncing = true;
      const executeSpy = vi.spyOn(controller, 'getAllCurrentPlaylists').mockReturnValue([]);

      await controller.playCurrentTrack();
      expect(controller._pendingDebouncedPlay).toBe(true);
      expect(executeSpy).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('skips transition if current tracks already match resolved target context and audio is playing', async () => {
      const sound1 = createMockSound('s1', 'Sound 1', { playing: true });
      const playlist = createMockPlaylist('p1', 'Playlist 1', [sound1]);
      const targetCtx = { playlist, tracks: [sound1], context: 'area' };

      controller.currentContext = { playlist };
      controller.currentTracks = [sound1];

      vi.spyOn(controller, 'getAllCurrentPlaylists').mockReturnValue([targetCtx]);
      vi.spyOn(controller, 'filterPlaylists').mockReturnValue(true);
      const transitionSpy = vi.spyOn(controller, 'transitionToContext').mockResolvedValue();

      await controller.playCurrentTrack();
      expect(transitionSpy).not.toHaveBeenCalled();
    });

    it('restarts transition if context matches but audio is not actually playing (stuck-silent state)', async () => {
      // sound1.playing = false simulates the stuck state after rapid transitions
      const sound1 = createMockSound('s1', 'Sound 1', { playing: false });
      const playlist = createMockPlaylist('p1', 'Playlist 1', [sound1]);
      const targetCtx = { playlist, tracks: [sound1], context: 'area' };

      controller.currentContext = { playlist };
      controller.currentTracks = [sound1];

      vi.spyOn(controller, 'getAllCurrentPlaylists').mockReturnValue([targetCtx]);
      vi.spyOn(controller, 'filterPlaylists').mockReturnValue(true);
      const transitionSpy = vi.spyOn(controller, 'transitionToContext').mockResolvedValue();

      await controller.playCurrentTrack();
      expect(transitionSpy).toHaveBeenCalledWith(targetCtx);
    });
  });

  describe('transitionToContext', () => {
    it('fades out playing active tracks not in target context and starts new tracks', async () => {
      setMockSetting('vgmusic', 'fadeDuration', 2); // 2 seconds

      const playingSound = createMockSound('old1', 'Old Track', { playing: true });
      const playingPlaylist = createMockPlaylist('oldP', 'Old Playlist', [playingSound]);
      game.playlists.playing = [playingPlaylist];

      const newSound = createMockSound('new1', 'New Track');
      const newPlaylist = createMockPlaylist('newP', 'New Playlist', [newSound]);
      const targetCtx = { playlist: newPlaylist, tracks: [newSound], scopeEntity: null };

      const playTrackSpy = vi.spyOn(controller, 'playTrack').mockResolvedValue();
      const stopTrackSpy = vi.spyOn(controller, 'stopTrack');

      await controller.transitionToContext(targetCtx);

      expect(playingSound.sound.fade).toHaveBeenCalledWith(0, { duration: 2000 });
      expect(controller.currentContext).toBe(targetCtx);
      expect(controller.currentTracks).toEqual([newSound]);
      expect(playTrackSpy).toHaveBeenCalledWith(newSound);
    });

    it('immediately stops playing tracks when fadeDuration is 0', async () => {
      setMockSetting('vgmusic', 'fadeDuration', 0);

      const playingSound = createMockSound('old1', 'Old Track', { playing: true });
      const playingPlaylist = createMockPlaylist('oldP', 'Old Playlist', [playingSound]);
      game.playlists.playing = [playingPlaylist];

      const newSound = createMockSound('new1', 'New Track');
      const newPlaylist = createMockPlaylist('newP', 'New Playlist', [newSound]);
      const targetCtx = { playlist: newPlaylist, tracks: [newSound], scopeEntity: null };

      const stopTrackSpy = vi.spyOn(controller, 'stopTrack');
      await controller.transitionToContext(targetCtx);

      expect(stopTrackSpy).toHaveBeenCalledWith(playingSound);
    });

    it('triggers _refreshUI and re-renders open playlistTree and moodWidget applications', async () => {
      const treeRender = vi.fn();
      const widgetRender = vi.fn();
      game.vgmusic = {
        playlistTree: { rendered: true, render: treeRender },
        moodWidget: { rendered: true, render: widgetRender }
      };

      await controller.transitionToContext(null);

      expect(treeRender).toHaveBeenCalledWith(false);
      expect(widgetRender).toHaveBeenCalledWith(false);
    });
  });

  describe('getAllCurrentPlaylists', () => {
    it('returns empty array when no scene, combat, or default music configured', () => {
      game.scenes.active = null;
      game.combats.active = null;
      expect(controller.getAllCurrentPlaylists()).toEqual([]);
    });

    it('collects scene area and combat contexts when active scene exists', () => {
      const areaPlaylist = createMockPlaylist('p1', 'Area Playlist', []);
      const combatPlaylist = createMockPlaylist('p2', 'Combat Playlist', []);
      game.playlists.get = vi.fn((id) => (id === 'p1' ? areaPlaylist : id === 'p2' ? combatPlaylist : null));

      const activeScene = new MockDocument({
        name: 'Scene 1',
        id: 'scene1',
        getFlag: vi.fn((mod, key) => {
          if (key === 'music.area') return { playlist: 'p1' };
          if (key === 'music.combat') return { playlist: 'p2' };
          return null;
        })
      });
      game.scenes.active = activeScene;

      const contexts = controller.getAllCurrentPlaylists();
      expect(contexts.map((c) => c.playlist)).toContain(areaPlaylist);
      expect(contexts.map((c) => c.playlist)).toContain(combatPlaylist);
    });

    it('collects default music context when configured', () => {
      const defaultPlaylist = createMockPlaylist('defP', 'Default Area', []);
      game.playlists.get = vi.fn((id) => (id === 'defP' ? defaultPlaylist : null));

      setMockSetting('vgmusic', 'defaultMusic', {
        documentName: 'DefaultMusic',
        data: { vgmusic: { music: { area: { playlist: 'defP' } } } }
      });

      const contexts = controller.getAllCurrentPlaylists();
      expect(contexts.map((c) => c.playlist)).toContain(defaultPlaylist);
    });
  });

  describe('isManagedPlaylist', () => {
    it('returns false for null/undefined playlist', () => {
      expect(controller.isManagedPlaylist(null)).toBe(false);
    });

    it('returns true when playlist matches currentContext playlist', () => {
      const playlist = createMockPlaylist('p1', 'Playlist 1', []);
      controller.currentContext = { playlist };

      expect(controller.isManagedPlaylist(playlist)).toBe(true);
    });

    it('returns true when playlist is configured in scene flags', () => {
      const playlist = createMockPlaylist('p1', 'Scene Playlist', []);
      const scene = {
        getFlag: vi.fn((mod, key) => (key === 'music' ? { area: { playlist: 'p1' } } : null))
      };
      game.scenes = [scene];

      expect(controller.isManagedPlaylist(playlist)).toBe(true);
    });

    it('returns true when playlist is configured in actor mood overrides', () => {
      const playlist = createMockPlaylist('p1', 'Boss Playlist', []);
      const actor = {
        getFlag: vi.fn((mod, key) => (key === 'music' ? { combat: { moods: { boss: { playlist: 'p1' } } } } : null))
      };
      game.actors = [actor];

      expect(controller.isManagedPlaylist(playlist)).toBe(true);
    });

    it('returns false when playlist is not managed by VGMusic', () => {
      const playlist = createMockPlaylist('unmanaged', 'Unmanaged', []);
      game.scenes = [];
      game.actors = [];

      expect(controller.isManagedPlaylist(playlist)).toBe(false);
    });
  });

  describe('6-tier hierarchy resolution', () => {
    let globalDefaultPl, globalMoodPl, sceneDefaultPl, sceneMoodPl, tokenDefaultPl, tokenMoodPl;

    beforeEach(() => {
      globalDefaultPl = createMockPlaylist('g-def', 'Global Default', []);
      globalMoodPl = createMockPlaylist('g-mood', 'Global Mood', []);
      sceneDefaultPl = createMockPlaylist('s-def', 'Scene Default', []);
      sceneMoodPl = createMockPlaylist('s-mood', 'Scene Mood', []);
      tokenDefaultPl = createMockPlaylist('t-def', 'Token Default', []);
      tokenMoodPl = createMockPlaylist('t-mood', 'Token Mood', []);

      const playlistsMap = {
        'g-def': globalDefaultPl,
        'g-mood': globalMoodPl,
        's-def': sceneDefaultPl,
        's-mood': sceneMoodPl,
        't-def': tokenDefaultPl,
        't-mood': tokenMoodPl
      };
      game.playlists.get = vi.fn((id) => playlistsMap[id] || null);

      setMockSetting('vgmusic', 'defaultMusic', {
        documentName: 'DefaultMusic',
        data: {
          vgmusic: {
            music: {
              area: {
                playlist: 'g-def',
                priority: -40,
                moods: { calm: { playlist: 'g-mood' } }
              }
            }
          }
        }
      });
    });

    it('Level 1 vs Level 2: Global Mood beats Global Default when mood is active', () => {
      setMockSetting('vgmusic', 'activeMood', 'calm');
      game.scenes.active = null;

      const contexts = controller.getAllCurrentPlaylists();
      contexts.sort((a, b) => controller.sortPlaylists(a, b, null));

      expect(contexts[0].playlist).toBe(globalMoodPl);
      expect(contexts[0].priority).toBe(-30);
    });

    it('Level 2 vs Level 3: Scene Default beats Global Mood', () => {
      setMockSetting('vgmusic', 'activeMood', 'calm');
      const activeScene = new MockDocument({
        name: 'Test Scene',
        id: 'sc1',
        getFlag: vi.fn((mod, key) => (key === 'music.area' ? { playlist: 's-def', priority: -20 } : null))
      });
      game.scenes.active = activeScene;

      const contexts = controller.getAllCurrentPlaylists();
      contexts.sort((a, b) => controller.sortPlaylists(a, b, null));

      expect(contexts[0].playlist).toBe(sceneDefaultPl);
      expect(contexts[0].priority).toBe(-20);
    });

    it('Level 3 vs Level 4: Scene Mood beats Scene Default and Global Mood', () => {
      setMockSetting('vgmusic', 'activeMood', 'calm');
      const activeScene = new MockDocument({
        name: 'Test Scene',
        id: 'sc1',
        getFlag: vi.fn((mod, key) => {
          if (key === 'music.area') {
            return {
              playlist: 's-def',
              priority: -20,
              moods: { calm: { playlist: 's-mood' } }
            };
          }
          return null;
        })
      });
      game.scenes.active = activeScene;

      const contexts = controller.getAllCurrentPlaylists();
      contexts.sort((a, b) => controller.sortPlaylists(a, b, null));

      expect(contexts[0].playlist).toBe(sceneMoodPl);
      expect(contexts[0].priority).toBe(-10);
    });

    it('Level 4 vs Level 5: Token Default beats Scene Mood', () => {
      setMockSetting('vgmusic', 'activeMood', 'calm');
      const activeScene = new MockDocument({
        name: 'Test Scene',
        id: 'sc1',
        getFlag: vi.fn((mod, key) => {
          if (key === 'music.area') {
            return {
              playlist: 's-def',
              priority: -20,
              moods: { calm: { playlist: 's-mood' } }
            };
          }
          return null;
        })
      });
      game.scenes.active = activeScene;

      function PrototypeToken() {
        this.flags = {
          vgmusic: {
            music: {
              combat: { playlist: 't-def', priority: 20 }
            }
          }
        };
      }
      const token = new PrototypeToken();
      game.combats = {
        active: {
          started: true,
          combatant: { token },
          combatants: [{ token }]
        }
      };

      const contexts = controller.getAllCurrentPlaylists();
      contexts.sort((a, b) => controller.sortPlaylists(a, b, game.combats.active));

      expect(contexts[0].playlist).toBe(tokenDefaultPl);
      expect(contexts[0].priority).toBe(20);
    });

    it('Level 5 vs Level 6: Token Mood beats Token Default', () => {
      setMockSetting('vgmusic', 'activeMood', 'calm');
      function PrototypeToken() {
        this.flags = {
          vgmusic: {
            music: {
              combat: {
                playlist: 't-def',
                priority: 20,
                moods: { calm: { playlist: 't-mood' } }
              }
            }
          }
        };
      }
      const token = new PrototypeToken();
      game.combats = {
        active: {
          started: true,
          combatant: { token },
          combatants: [{ token }]
        }
      };

      const contexts = controller.getAllCurrentPlaylists();
      contexts.sort((a, b) => controller.sortPlaylists(a, b, game.combats.active));

      expect(contexts[0].playlist).toBe(tokenMoodPl);
      expect(contexts[0].priority).toBe(30);
    });
  });
});
