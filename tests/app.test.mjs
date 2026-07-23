import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupFoundryMocks, setMockSetting, MockDocument, createMockPlaylist } from './mocks/foundry.mjs';

setupFoundryMocks();

import { VGMusicConfig } from '../scripts/app.mjs';
import { CONST } from '../scripts/config.mjs';

describe('VGMusicConfig', () => {
  let app;
  let tokenDoc;

  beforeEach(() => {
    setupFoundryMocks();

    tokenDoc = new MockDocument({
      documentName: 'Token',
      id: 'tok1',
      name: 'Guard',
      flags: { vgmusic: { music: { combat: { moods: { boss: { playlist: 'pl-boss' } } } } } },
      update: vi.fn().mockResolvedValue()
    });

    const pl1 = createMockPlaylist('pl-boss', 'Boss Playlist', []);
    const pl2 = createMockPlaylist('pl-area', 'Area Playlist', []);
    game.playlists = [pl1, pl2];

    game.vgmusic = {
      configApp: null,
      musicController: { currentContext: null, playCurrentTrack: vi.fn() }
    };

    app = new VGMusicConfig(tokenDoc);
  });

  describe('isTokenMoodGrid', () => {
    it('is true for Token documents', () => {
      expect(app.isTokenMoodGrid).toBe(true);
    });

    it('is false for Scene documents', () => {
      const sceneDoc = new MockDocument({ documentName: 'Scene', id: 'sc1', flags: {} });
      const sceneApp = new VGMusicConfig(sceneDoc);
      expect(sceneApp.isTokenMoodGrid).toBe(false);
    });
  });

  describe('_prepareContext (mood-grid)', () => {
    it('builds moodCards and defaultEntry for a Token document', () => {
      setMockSetting('vgmusic', 'configuredMoods', CONST.defaultMoods);

      const ctx = app._prepareContext({});

      expect(ctx.isTokenMoodGrid).toBe(true);
      expect(ctx.moodCards.find((m) => m.moodId === 'boss').combat.playlistId).toBe('pl-boss');
      expect(ctx.moodCards.find((m) => m.moodId === 'boss').hasOverride).toBe(true);
      expect(ctx.defaultEntry.combat.playlistId).toBeNull();
    });

    it('marks a mood card as resolving when it is the currently playing context', () => {
      setMockSetting('vgmusic', 'configuredMoods', CONST.defaultMoods);
      setMockSetting('vgmusic', 'activeMood', 'boss');
      game.vgmusic.musicController.currentContext = { contextEntity: tokenDoc, isMood: true };

      const ctx = app._prepareContext({});

      expect(ctx.moodCards.find((m) => m.moodId === 'boss').isResolving).toBe(true);
      expect(ctx.moodsResolving).toBe(true);
      expect(ctx.defaultResolving).toBe(false);
    });
  });

  describe('handleUpdateMoodEntry / handleClearMoodEntry', () => {
    it('sets the mood-scoped combat playlist flag when a playlist is selected', async () => {
      const target = { value: 'pl-area', dataset: { moodId: 'tense' }, closest: () => null };

      await VGMusicConfig.handleUpdateMoodEntry.call(app, new Event('change'), target);

      expect(tokenDoc.update).toHaveBeenCalledWith(expect.objectContaining({ 'flags.vgmusic.music.combat.moods.tense.playlist': 'pl-area' }));
      expect(game.vgmusic.musicController.playCurrentTrack).toHaveBeenCalled();
    });

    it('clears the mood-scoped combat entry when no playlist is selected', async () => {
      const target = { value: '', dataset: { moodId: 'boss' }, closest: () => null };

      await VGMusicConfig.handleUpdateMoodEntry.call(app, new Event('change'), target);

      expect(tokenDoc.update).toHaveBeenCalledWith(expect.objectContaining({ 'flags.vgmusic.music.combat.moods.-=boss': null }));
    });

    it('automatically assigns the first track for a Soundboard playlist', async () => {
      const soundboardPlaylist = createMockPlaylist('pl-sfx', 'SFX Soundboard', [{ id: 'tr-1', name: 'Alarm' }]);
      soundboardPlaylist.mode = -1;
      game.playlists.push(soundboardPlaylist);
      game.playlists.get = vi.fn((id) => (id === 'pl-sfx' ? soundboardPlaylist : null));
      const target = { value: 'pl-sfx', dataset: { moodId: 'boss' }, closest: () => null };

      await VGMusicConfig.handleUpdateMoodEntry.call(app, new Event('change'), target);

      expect(tokenDoc.update).toHaveBeenCalledWith(
        expect.objectContaining({
          'flags.vgmusic.music.combat.moods.boss.playlist': 'pl-sfx',
          'flags.vgmusic.music.combat.moods.boss.initialTrack': 'tr-1'
        })
      );
    });

    it('deletes the whole mood entry on clear', async () => {
      const target = { dataset: { moodId: 'boss' }, closest: () => null };

      await VGMusicConfig.handleClearMoodEntry.call(app, { preventDefault: vi.fn() }, target);

      expect(tokenDoc.update).toHaveBeenCalledWith(expect.objectContaining({ 'flags.vgmusic.music.combat.moods.-=boss': null }));
    });
  });

  describe('handleUpdateMoodTrack', () => {
    it('sets the mood-scoped track flag', async () => {
      const target = { value: 'tr-9', dataset: { moodId: 'boss' }, closest: () => null };

      await VGMusicConfig.handleUpdateMoodTrack.call(app, new Event('change'), target);

      expect(tokenDoc.update).toHaveBeenCalledWith(expect.objectContaining({ 'flags.vgmusic.music.combat.moods.boss.initialTrack': 'tr-9' }));
    });

    it('unsets the mood-scoped track flag when cleared', async () => {
      const target = { value: '', dataset: { moodId: 'boss' }, closest: () => null };

      await VGMusicConfig.handleUpdateMoodTrack.call(app, new Event('change'), target);

      expect(tokenDoc.update).toHaveBeenCalledWith(expect.objectContaining({ 'flags.vgmusic.music.combat.moods.boss.-=initialTrack': null }));
    });
  });

  describe('handleUpdateDefaultEntry / handleClearDefaultEntry', () => {
    it('sets the default combat playlist flag', async () => {
      const target = { value: 'pl-area', dataset: {}, closest: () => null };

      await VGMusicConfig.handleUpdateDefaultEntry.call(app, new Event('change'), target);

      expect(tokenDoc.update).toHaveBeenCalledWith(expect.objectContaining({ 'flags.vgmusic.music.combat.playlist': 'pl-area' }));
    });

    it('clears the default combat entry without deleting mood overrides', async () => {
      await VGMusicConfig.handleClearDefaultEntry.call(app, { preventDefault: vi.fn() }, {});

      expect(tokenDoc.update).toHaveBeenCalledWith(
        expect.objectContaining({
          'flags.vgmusic.music.combat.-=playlist': null,
          'flags.vgmusic.music.combat.-=initialTrack': null,
          'flags.vgmusic.music.combat.-=priority': null
        })
      );
    });
  });

  describe('_onChangeInput', () => {
    it('dispatches mood-grid select changes based on data-change-action', () => {
      const spy = vi.spyOn(VGMusicConfig, 'handleUpdateMoodEntry').mockImplementation(() => {});
      const selectEl = { tagName: 'SELECT', dataset: { changeAction: 'updateMoodEntry' } };

      app._onChangeInput({ target: selectEl });

      expect(spy).toHaveBeenCalledWith(expect.anything(), selectEl);
      spy.mockRestore();
    });

    it('ignores selects without a data-change-action (old tabbed-form fields)', () => {
      const spy = vi.spyOn(VGMusicConfig, 'handleUpdateMoodEntry').mockImplementation(() => {});
      const selectEl = { tagName: 'SELECT', dataset: {} };

      app._onChangeInput({ target: selectEl });

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('handleToggleSection', () => {
    it('toggles a section key between expanded/collapsed and re-renders', () => {
      const renderSpy = vi.spyOn(app, 'render').mockImplementation(() => {});
      const target = { dataset: { section: 'tokenMoods', defaultCollapsed: 'false' }, closest: () => null };

      VGMusicConfig.handleToggleSection.call(app, { preventDefault: vi.fn() }, target);
      expect(app.collapsedSections.has('tokenMoods')).toBe(true);

      VGMusicConfig.handleToggleSection.call(app, { preventDefault: vi.fn() }, target);
      expect(app.expandedSections.has('tokenMoods')).toBe(true);
      expect(renderSpy).toHaveBeenCalled();
    });
  });

  describe('onDropExternal (drag-and-drop from the Playlists directory)', () => {
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
      app.element = { querySelectorAll: vi.fn(() => []) };
    });

    function makeDropEvent(payload, dataset) {
      return {
        preventDefault: vi.fn(),
        currentTarget: { classList: { add: vi.fn(), remove: vi.fn() }, dataset },
        dataTransfer: { getData: vi.fn(() => JSON.stringify(payload)) }
      };
    }

    it('assigns a dropped Playlist to the mood-grid entry indicated by data-mood-id', async () => {
      const droppedPlaylist = new MockPlaylistDoc({ id: 'pl-area', name: 'Area Playlist', mode: 0 });
      globalThis.fromUuid = vi.fn().mockResolvedValue(droppedPlaylist);
      game.playlists.get = vi.fn((id) => (id === 'pl-area' ? droppedPlaylist : null));

      const event = makeDropEvent({ type: 'Playlist', uuid: 'Playlist.pl-area' }, { section: 'combat', moodId: 'tense' });

      const result = await app.onDropExternal(event);

      expect(result).toBe(true);
      expect(tokenDoc.update).toHaveBeenCalledWith(expect.objectContaining({ 'flags.vgmusic.music.combat.moods.tense.playlist': 'pl-area' }));
    });

    it('falls back to the tabbed selectedMood when data-mood-id is absent (old fieldset flow)', async () => {
      app.selectedMood = 'victory';
      const droppedPlaylist = new MockPlaylistDoc({ id: 'pl-area', name: 'Area Playlist', mode: 0 });
      globalThis.fromUuid = vi.fn().mockResolvedValue(droppedPlaylist);
      game.playlists.get = vi.fn((id) => (id === 'pl-area' ? droppedPlaylist : null));

      const event = makeDropEvent({ type: 'Playlist', uuid: 'Playlist.pl-area' }, { section: 'combat' });

      await app.onDropExternal(event);

      expect(tokenDoc.update).toHaveBeenCalledWith(expect.objectContaining({ 'flags.vgmusic.music.combat.moods.victory.playlist': 'pl-area' }));
    });

    it('carries over an existing track when dropping a non-Soundboard playlist with no explicit track', async () => {
      tokenDoc.flags.vgmusic.music.combat.moods.boss.initialTrack = 'tr-old';
      const droppedPlaylist = new MockPlaylistDoc({ id: 'pl-boss', name: 'Boss Playlist', mode: 0 });
      globalThis.fromUuid = vi.fn().mockResolvedValue(droppedPlaylist);
      game.playlists.get = vi.fn((id) => (id === 'pl-boss' ? droppedPlaylist : null));

      const event = makeDropEvent({ type: 'Playlist', uuid: 'Playlist.pl-boss' }, { section: 'combat', moodId: 'boss' });

      await app.onDropExternal(event);

      expect(tokenDoc.update).toHaveBeenCalledWith(expect.objectContaining({ 'flags.vgmusic.music.combat.moods.boss.initialTrack': 'tr-old' }));
    });
  });

  describe('_onDragLeaveExternal', () => {
    it('clears drop-hover when the drag genuinely leaves the drop target', () => {
      const box = { contains: vi.fn(() => false), classList: { remove: vi.fn() } };
      const child = { closest: vi.fn(() => box) };

      app._onDragLeaveExternal({ target: child, relatedTarget: {} });

      expect(box.classList.remove).toHaveBeenCalledWith('drop-hover');
    });

    it('does not clear drop-hover when moving between child elements of the same target', () => {
      const box = { contains: vi.fn(() => true), classList: { remove: vi.fn() } };
      const child = { closest: vi.fn(() => box) };

      app._onDragLeaveExternal({ target: child, relatedTarget: {} });

      expect(box.classList.remove).not.toHaveBeenCalled();
    });

    it('does nothing when leaving an element outside any drop target', () => {
      const target = { closest: vi.fn(() => null) };

      expect(() => app._onDragLeaveExternal({ target, relatedTarget: null })).not.toThrow();
    });
  });

  describe('_onRender / _onClose event listener management', () => {
    it('attaches change and dragleave listeners only once each across multiple _onRender calls', () => {
      const mockElement = { addEventListener: vi.fn(), removeEventListener: vi.fn(), querySelectorAll: vi.fn(() => []) };
      app.element = mockElement;

      app._onRender({}, {});
      app._onRender({}, {});

      const changeCalls = mockElement.addEventListener.mock.calls.filter((c) => c[0] === 'change');
      const dragleaveCalls = mockElement.addEventListener.mock.calls.filter((c) => c[0] === 'dragleave');
      expect(changeCalls).toHaveLength(1);
      expect(dragleaveCalls).toHaveLength(1);
    });

    it('removes change and dragleave listeners on _onClose', () => {
      const mockElement = { addEventListener: vi.fn(), removeEventListener: vi.fn(), querySelectorAll: vi.fn(() => []) };
      app.element = mockElement;

      app._onRender({}, {});
      app._onClose({});

      expect(mockElement.removeEventListener).toHaveBeenCalledWith('change', app._onChangeInputHandler);
      expect(mockElement.removeEventListener).toHaveBeenCalledWith('dragleave', app._onDragLeaveHandler);
      expect(app._changeListenerBound).toBe(false);
      expect(app._dragLeaveListenerBound).toBe(false);
    });
  });
});
