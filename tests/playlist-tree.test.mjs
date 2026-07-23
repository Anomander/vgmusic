import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupFoundryMocks, setMockSetting, MockDocument, createMockPlaylist } from './mocks/foundry.mjs';

setupFoundryMocks();

import { PlaylistTreeApp } from '../scripts/playlist-tree.mjs';
import { CONST } from '../scripts/config.mjs';

describe('PlaylistTreeApp', () => {
  let app;
  let scene1;

  beforeEach(() => {
    setupFoundryMocks();
    scene1 = new MockDocument({
      name: 'Sunken Temple',
      id: 'sc1',
      getFlag: vi.fn((mod, key) => {
        if (key === 'music.area.playlist') return 'pl-area';
        if (key === 'music.area.moods.boss.playlist') return 'pl-boss';
        return null;
      }),
      setFlag: vi.fn().mockResolvedValue(),
      unsetFlag: vi.fn().mockResolvedValue()
    });
    game.scenes = [scene1];
    game.scenes.get = vi.fn((id) => (id === 'sc1' ? scene1 : null));
    game.scenes.active = scene1;

    const pl1 = createMockPlaylist('pl-area', 'Area Playlist', []);
    const pl2 = createMockPlaylist('pl-boss', 'Boss Playlist', []);
    game.playlists = [pl1, pl2];

    game.vgmusic = {
      playlistTree: null,
      musicController: {
        currentContext: null,
        playCurrentTrack: vi.fn()
      }
    };

    app = new PlaylistTreeApp();
  });

  describe('_prepareContext', () => {
    it('prepares context data with scene list, selected scene defaults, moods, and global settings', () => {
      setMockSetting('vgmusic', 'activeMood', 'boss');
      setMockSetting('vgmusic', 'defaultMusic', {
        documentName: 'DefaultMusic',
        data: {
          vgmusic: {
            music: {
              area: { playlist: 'g-area', moods: { boss: { playlist: 'g-boss' } } }
            }
          }
        }
      });

      const ctx = app._prepareContext({});

      expect(ctx.scenes).toHaveLength(1);
      expect(ctx.scenes[0].id).toBe('sc1');
      expect(ctx.selectedSceneId).toBe('sc1');

      expect(ctx.sceneDefaults.area.playlistId).toBe('pl-area');
      expect(ctx.sceneMoods.find((m) => m.moodId === 'boss').area.playlistId).toBe('pl-boss');

      expect(ctx.globalDefaults.area.playlistId).toBe('g-area');
      expect(ctx.globalMoods.find((m) => m.moodId === 'boss').area.playlistId).toBe('g-boss');
    });

    it('populates activeResolutionInfo when musicController has currentContext', () => {
      game.vgmusic.musicController.currentContext = {
        contextEntity: scene1,
        isMood: true,
        context: 'area'
      };
      setMockSetting('vgmusic', 'activeMood', 'boss');

      const ctx = app._prepareContext({});

      expect(ctx.activeResolutionInfo).toBeDefined();
      expect(ctx.activeResolutionInfo.label).toContain('Scene Mood (boss)');
    });
  });

  describe('handleSelectScene', () => {
    it('updates selectedSceneId and re-renders app', () => {
      const renderSpy = vi.spyOn(app, 'render').mockImplementation(() => {});
      game.vgmusic.playlistTree = app;

      const event = { preventDefault: vi.fn() };
      const target = { value: 'sc1', closest: () => null };

      PlaylistTreeApp.handleSelectScene.call(app, event, target);

      expect(app.selectedSceneId).toBe('sc1');
      expect(renderSpy).toHaveBeenCalledWith(false);
    });
  });

  describe('handleUpdateSceneMood and handleClearSceneMood', () => {
    it('sets scene mood flag when playlistId is provided', async () => {
      game.vgmusic.playlistTree = app;
      app.selectedSceneId = 'sc1';

      const target = {
        value: 'pl-boss',
        dataset: { moodId: 'boss', contextType: 'area' },
        closest: () => null
      };

      await PlaylistTreeApp.handleUpdateSceneMood(new Event('change'), target);

      expect(scene1.setFlag).toHaveBeenCalledWith('vgmusic', 'music.area.moods.boss.playlist', 'pl-boss');
      expect(game.vgmusic.musicController.playCurrentTrack).toHaveBeenCalled();
    });

    it('unsets scene mood flag when clearing scene mood', async () => {
      game.vgmusic.playlistTree = app;
      app.selectedSceneId = 'sc1';

      const event = { preventDefault: vi.fn() };
      const target = {
        dataset: { moodId: 'boss', contextType: 'area' },
        closest: () => null
      };

      await PlaylistTreeApp.handleClearSceneMood(event, target);

      expect(scene1.unsetFlag).toHaveBeenCalledWith('vgmusic', 'music.area.moods.boss.playlist');
      expect(game.vgmusic.musicController.playCurrentTrack).toHaveBeenCalled();
    });
  });

  describe('handleUpdateSceneDefault and handleClearSceneDefault', () => {
    it('sets scene default flag when playlist is selected', async () => {
      game.vgmusic.playlistTree = app;
      app.selectedSceneId = 'sc1';

      const target = {
        value: 'pl-area',
        dataset: { contextType: 'area' },
        closest: () => null
      };

      await PlaylistTreeApp.handleUpdateSceneDefault(new Event('change'), target);

      expect(scene1.setFlag).toHaveBeenCalledWith('vgmusic', 'music.area.playlist', 'pl-area');
    });

    it('unsets scene default flag when clearing scene default', async () => {
      game.vgmusic.playlistTree = app;
      app.selectedSceneId = 'sc1';

      const event = { preventDefault: vi.fn() };
      const target = {
        dataset: { contextType: 'area' },
        closest: () => null
      };

      await PlaylistTreeApp.handleClearSceneDefault(event, target);

      expect(scene1.unsetFlag).toHaveBeenCalledWith('vgmusic', 'music.area.playlist');
    });
  });

  describe('handleUpdateGlobalMood and handleClearGlobalMood', () => {
    it('updates defaultMusic setting with global mood override', async () => {
      game.vgmusic.playlistTree = app;
      setMockSetting('vgmusic', 'defaultMusic', { documentName: 'DefaultMusic', data: { vgmusic: { music: {} } } });

      const target = {
        value: 'pl-boss',
        dataset: { moodId: 'boss', contextType: 'combat' },
        closest: () => null
      };

      await PlaylistTreeApp.handleUpdateGlobalMood(new Event('change'), target);

      expect(game.settings.set).toHaveBeenCalledWith(
        CONST.moduleId,
        CONST.settings.defaultMusic,
        expect.objectContaining({
          data: expect.objectContaining({
            vgmusic: expect.objectContaining({
              music: expect.objectContaining({
                combat: expect.objectContaining({
                  moods: expect.objectContaining({
                    boss: { playlist: 'pl-boss' }
                  })
                })
              })
            })
          })
        })
      );
    });
  });

  describe('handleUpdateGlobalDefault and handleClearGlobalDefault', () => {
    it('updates defaultMusic setting with global default override', async () => {
      game.vgmusic.playlistTree = app;
      setMockSetting('vgmusic', 'defaultMusic', { documentName: 'DefaultMusic', data: { vgmusic: { music: {} } } });

      const target = {
        value: 'pl-area',
        dataset: { contextType: 'area' },
        closest: () => null
      };

      await PlaylistTreeApp.handleUpdateGlobalDefault(new Event('change'), target);

      expect(game.settings.set).toHaveBeenCalledWith(
        CONST.moduleId,
        CONST.settings.defaultMusic,
        expect.objectContaining({
          data: expect.objectContaining({
            vgmusic: expect.objectContaining({
              music: expect.objectContaining({
                area: expect.objectContaining({ playlist: 'pl-area' })
              })
            })
          })
        })
      );
    });
  });

  describe('toggle and open static methods', () => {
    it('opens PlaylistTreeApp window when not already open', () => {
      PlaylistTreeApp.open();
      expect(game.vgmusic.playlistTree).toBeInstanceOf(PlaylistTreeApp);
    });

    it('toggles existing window closed when open', () => {
      const mockClose = vi.fn();
      game.vgmusic.playlistTree = { rendered: true, close: mockClose };

      PlaylistTreeApp.toggle();

      expect(mockClose).toHaveBeenCalled();
      expect(game.vgmusic.playlistTree).toBeNull();
    });
  });

  describe('Track Selection & Soundboard Validation', () => {
    it('updates initialTrack flag when selecting a track', async () => {
      game.vgmusic.playlistTree = app;
      const target = {
        value: 'tr-boss-1',
        dataset: { moodId: 'boss', contextType: 'area' },
        closest: () => null
      };

      await PlaylistTreeApp.handleUpdateSceneMoodTrack(new Event('change'), target);

      expect(scene1.setFlag).toHaveBeenCalledWith(
        CONST.moduleId,
        'music.area.moods.boss.initialTrack',
        'tr-boss-1'
      );
    });

    it('automatically assigns first track when selecting a Soundboard playlist with no track set', async () => {
      game.vgmusic.playlistTree = app;
      const soundboardPlaylist = createMockPlaylist('pl-sfx', 'SFX Soundboard', [{ id: 'tr-sfx-1', name: 'Roar' }]);
      soundboardPlaylist.mode = -1; // UNSEQUENCED mode
      game.playlists.push(soundboardPlaylist);
      game.playlists.get = vi.fn((id) => (id === 'pl-sfx' ? soundboardPlaylist : null));

      const target = {
        value: 'pl-sfx',
        dataset: { moodId: 'boss', contextType: 'area' },
        closest: () => null
      };

      await PlaylistTreeApp.handleUpdateSceneMood(new Event('change'), target);

      expect(scene1.setFlag).toHaveBeenCalledWith(
        CONST.moduleId,
        'music.area.moods.boss.playlist',
        'pl-sfx'
      );
      expect(scene1.setFlag).toHaveBeenCalledWith(
        CONST.moduleId,
        'music.area.moods.boss.initialTrack',
        'tr-sfx-1'
      );
    });

    it('automatically assigns first track when selecting a Soundboard playlist for the global default (no mood)', async () => {
      game.vgmusic.playlistTree = app;
      setMockSetting('vgmusic', 'defaultMusic', { documentName: 'DefaultMusic', data: { vgmusic: { music: {} } } });
      const soundboardPlaylist = createMockPlaylist('pl-sfx', 'SFX Soundboard', [{ id: 'tr-sfx-1', name: 'Roar' }]);
      soundboardPlaylist.mode = -1; // UNSEQUENCED mode
      game.playlists.push(soundboardPlaylist);
      game.playlists.get = vi.fn((id) => (id === 'pl-sfx' ? soundboardPlaylist : null));

      const target = {
        value: 'pl-sfx',
        dataset: { contextType: 'combat' },
        closest: () => null
      };

      await PlaylistTreeApp.handleUpdateGlobalDefault(new Event('change'), target);

      expect(game.settings.set).toHaveBeenCalledWith(
        CONST.moduleId,
        CONST.settings.defaultMusic,
        expect.objectContaining({
          data: expect.objectContaining({
            vgmusic: expect.objectContaining({
              music: expect.objectContaining({
                combat: { playlist: 'pl-sfx', initialTrack: 'tr-sfx-1' }
              })
            })
          })
        })
      );
    });
  });

  describe('_onChangeInput', () => {
    it('dispatches select change events based on data-change-action', () => {
      game.vgmusic.playlistTree = app;
      const spy = vi.spyOn(PlaylistTreeApp, 'handleSelectScene').mockImplementation(() => {});

      const selectEl = {
        tagName: 'SELECT',
        dataset: { changeAction: 'selectScene' }
      };

      app._onChangeInput({ target: selectEl });

      expect(spy).toHaveBeenCalledWith(expect.anything(), selectEl);
      spy.mockRestore();
    });
  });

  describe('handleOpenMoodConfig', () => {
    it('instantiates and renders MoodConfigApp when clicked', () => {
      const event = { preventDefault: vi.fn() };
      PlaylistTreeApp.handleOpenMoodConfig(event, null);
      expect(event.preventDefault).toHaveBeenCalled();
    });
  });

  describe('handleToggleSection and isSectionCollapsed', () => {
    it('toggles section key in expanded/collapsed sets and re-renders app', () => {
      game.vgmusic.playlistTree = app;
      const event = { preventDefault: vi.fn() };
      const target = { dataset: { section: 'sceneMoods', defaultCollapsed: 'false' }, closest: () => null };

      PlaylistTreeApp.handleToggleSection(event, target);

      expect(app.collapsedSections.has('sceneMoods')).toBe(true);

      PlaylistTreeApp.handleToggleSection(event, target);

      expect(app.expandedSections.has('sceneMoods')).toBe(true);
    });

    it('defaults to collapsed when an item has no overrides, and expanded when it has overrides', () => {
      expect(app.isSectionCollapsed('key1', true)).toBe(false); // Expanded
      expect(app.isSectionCollapsed('key2', false)).toBe(true); // Collapsed
    });
  });

  describe('_onRender event listener management', () => {
    it('attaches change and dragleave listeners only once each, even after multiple _onRender calls', () => {
      const mockElement = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };
      app.element = mockElement;

      app._onRender({}, {});
      app._onRender({}, {});
      app._onRender({}, {});

      expect(mockElement.addEventListener).toHaveBeenCalledTimes(2);
      expect(mockElement.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
      expect(mockElement.addEventListener).toHaveBeenCalledWith('dragleave', expect.any(Function));
    });

    it('removes change and dragleave listeners on _onClose and resets flags', () => {
      const mockElement = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };
      app.element = mockElement;

      app._onRender({}, {});
      expect(app._changeListenerBound).toBe(true);
      expect(app._dragLeaveListenerBound).toBe(true);

      app._onClose({});
      expect(mockElement.removeEventListener).toHaveBeenCalledWith('change', app._onChangeInputHandler);
      expect(mockElement.removeEventListener).toHaveBeenCalledWith('dragleave', app._onDragLeaveHandler);
      expect(app._changeListenerBound).toBe(false);
      expect(app._dragLeaveListenerBound).toBe(false);
    });
  });

  describe('_onDropExternal (drag-and-drop from the Playlists directory)', () => {
    class MockPlaylistDoc {
      constructor(data) {
        Object.assign(this, data);
      }
    }
    class MockPlaylistSoundDoc {
      constructor(data) {
        Object.assign(this, data);
      }
    }

    beforeEach(() => {
      globalThis.Playlist = MockPlaylistDoc;
      globalThis.PlaylistSound = MockPlaylistSoundDoc;
    });

    function makeDropEvent(payload, dataset) {
      return {
        currentTarget: { classList: { add: vi.fn(), remove: vi.fn() }, dataset },
        dataTransfer: { getData: vi.fn(() => JSON.stringify(payload)) }
      };
    }

    it('assigns a dropped Playlist to a scene mood area box', async () => {
      const droppedPlaylist = new MockPlaylistDoc({ id: 'pl-area', name: 'Area Playlist', mode: 0 });
      globalThis.fromUuid = vi.fn().mockResolvedValue(droppedPlaylist);
      game.playlists.get = vi.fn((id) => (id === 'pl-area' ? droppedPlaylist : null));

      const event = makeDropEvent({ type: 'Playlist', uuid: 'Playlist.pl-area' }, { dropScope: 'scene', contextType: 'area', moodId: 'boss' });

      const result = await app._onDropExternal(event);

      expect(result).toBe(true);
      expect(scene1.setFlag).toHaveBeenCalledWith(CONST.moduleId, 'music.area.moods.boss.playlist', 'pl-area');
      expect(game.vgmusic.musicController.playCurrentTrack).toHaveBeenCalled();
    });

    it('assigns a dropped PlaylistSound as the exact track on the global default combat box', async () => {
      const parentPlaylist = { id: 'pl-combat', name: 'Combat Playlist' };
      const droppedSound = new MockPlaylistSoundDoc({ id: 'tr-1', name: 'Track One', parent: parentPlaylist });
      globalThis.fromUuid = vi.fn().mockResolvedValue(droppedSound);
      setMockSetting('vgmusic', 'defaultMusic', { documentName: 'DefaultMusic', data: { vgmusic: { music: {} } } });

      const event = makeDropEvent({ type: 'PlaylistSound', uuid: 'Playlist.pl-combat.PlaylistSound.tr-1' }, { dropScope: 'global', contextType: 'combat' });

      const result = await app._onDropExternal(event);

      expect(result).toBe(true);
      expect(game.settings.set).toHaveBeenCalledWith(
        CONST.moduleId,
        CONST.settings.defaultMusic,
        expect.objectContaining({
          data: expect.objectContaining({
            vgmusic: expect.objectContaining({
              music: expect.objectContaining({
                combat: { playlist: 'pl-combat', initialTrack: 'tr-1' }
              })
            })
          })
        })
      );
    });

    it('ignores drops with unsupported document types', async () => {
      globalThis.fromUuid = vi.fn();
      const event = makeDropEvent({ type: 'Actor', uuid: 'Actor.abc' }, {});

      const result = await app._onDropExternal(event);

      expect(result).toBe(false);
      expect(globalThis.fromUuid).not.toHaveBeenCalled();
    });
  });

  describe('_onDragLeaveExternal', () => {
    it('clears drop-hover when the drag genuinely leaves the context box', () => {
      const box = {
        contains: vi.fn(() => false),
        classList: { remove: vi.fn() }
      };
      const child = { closest: vi.fn(() => box) };
      const outsideEl = {};

      app._onDragLeaveExternal({ target: child, relatedTarget: outsideEl });

      expect(box.classList.remove).toHaveBeenCalledWith('drop-hover');
    });

    it('does not clear drop-hover when the drag moves between child elements of the same box', () => {
      const box = {
        contains: vi.fn(() => true),
        classList: { remove: vi.fn() }
      };
      const child = { closest: vi.fn(() => box) };
      const otherChildOfSameBox = {};

      app._onDragLeaveExternal({ target: child, relatedTarget: otherChildOfSameBox });

      expect(box.classList.remove).not.toHaveBeenCalled();
    });

    it('does nothing when the drag leaves an element outside any context box', () => {
      const target = { closest: vi.fn(() => null) };

      expect(() => app._onDragLeaveExternal({ target, relatedTarget: null })).not.toThrow();
    });
  });
});
