import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupFoundryMocks } from './mocks/foundry.mjs';

setupFoundryMocks();

import { MoodConfigApp } from '../scripts/mood-config.mjs';
import { MoodWidget } from '../scripts/mood-widget.mjs';
import { registerSettings } from '../scripts/settings.mjs';
import { CONST } from '../scripts/config.mjs';
import { setMockSetting } from './mocks/foundry.mjs';

describe('MoodConfigApp', () => {
  beforeEach(() => {
    setupFoundryMocks();
  });

  describe('formHandler', () => {
    it('canonicalizes and deduplicates mood IDs on submission', async () => {
      const mockApp = {
        close: vi.fn()
      };

      const formData = {
        object: {
          'moods.0.label': 'Calm Mood',
          'moods.0.icon': 'fas fa-leaf',
          'moods.0.color': '#4caf50',
          'moods.1.label': 'Calm Mood',
          'moods.1.icon': 'fas fa-music',
          'moods.1.color': '#3b82f6',
          'moods.2.label': '  ', // empty label, should be filtered out
          'moods.2.icon': 'fas fa-music'
        }
      };

      await MoodConfigApp.formHandler.call(mockApp, new Event('submit'), null, formData);

      expect(game.settings.set).toHaveBeenCalledWith(
        CONST.moduleId,
        CONST.settings.configuredMoods,
        [
          { id: 'calm-mood', label: 'Calm Mood', icon: 'fas fa-leaf', color: '#4caf50' },
          { id: 'calm-mood-2', label: 'Calm Mood', icon: 'fas fa-music', color: '#3b82f6' }
        ]
      );

      expect(mockApp.close).toHaveBeenCalled();
    });

    it('handles settings.set error rejection gracefully', async () => {
      const mockApp = { close: vi.fn() };
      game.settings.set.mockRejectedValueOnce(new Error('Permission denied'));

      const formData = { object: { 'moods.0.label': 'Test Mood' } };

      await expect(MoodConfigApp.formHandler.call(mockApp, new Event('submit'), null, formData)).resolves.toBeUndefined();
      expect(ui.notifications.error).toHaveBeenCalledWith('Failed to save mood configuration');
    });
  });

  describe('handleAddMood', () => {
    it('pushes a new mood entry with defaults and re-renders app', () => {
      const mockApp = { moods: [], render: vi.fn() };
      const event = { preventDefault: vi.fn() };

      MoodConfigApp.handleAddMood.call(mockApp, event, null);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(mockApp.moods).toHaveLength(1);
      expect(mockApp.moods[0].label).toBe('New Mood');
      expect(mockApp.render).toHaveBeenCalledWith(false);
    });
  });

  describe('handleDeleteMood', () => {
    it('removes mood entry at target index and re-renders app', () => {
      const mockApp = { moods: [{ id: 'm1' }, { id: 'm2' }], render: vi.fn() };
      const event = { preventDefault: vi.fn() };
      const target = { dataset: { index: '0' } };

      MoodConfigApp.handleDeleteMood.call(mockApp, event, target);

      expect(mockApp.moods).toHaveLength(1);
      expect(mockApp.moods[0].id).toBe('m2');
      expect(mockApp.render).toHaveBeenCalledWith(false);
    });
  });

  describe('handleResetDefaults', () => {
    it('resets moods array to CONST.defaultMoods and re-renders app', () => {
      const mockApp = { moods: [], render: vi.fn() };
      const event = { preventDefault: vi.fn() };

      MoodConfigApp.handleResetDefaults.call(mockApp, event, null);

      expect(mockApp.moods).toEqual(CONST.defaultMoods);
      expect(mockApp.render).toHaveBeenCalledWith(false);
    });
  });
});

describe('MoodWidget', () => {
  beforeEach(() => {
    setupFoundryMocks();
  });

  describe('handleSetMood', () => {
    it('sets activeMood to selected moodId when different from current active mood', async () => {
      setMockSetting('vgmusic', 'activeMood', '');
      const event = { preventDefault: vi.fn() };
      const target = { closest: vi.fn().mockReturnValue({ dataset: { moodId: 'boss' } }) };

      await MoodWidget.handleSetMood(event, target);

      expect(game.settings.set).toHaveBeenCalledWith(CONST.moduleId, CONST.settings.activeMood, 'boss');
    });

    it('toggles off activeMood to empty string when clicking currently active mood', async () => {
      setMockSetting('vgmusic', 'activeMood', 'boss');
      const event = { preventDefault: vi.fn() };
      const target = { closest: vi.fn().mockReturnValue({ dataset: { moodId: 'boss' } }) };

      await MoodWidget.handleSetMood(event, target);

      expect(game.settings.set).toHaveBeenCalledWith(CONST.moduleId, CONST.settings.activeMood, '');
    });

    it('refreshes open windows registered in ui.windows when activeMood setting changes', () => {
      registerSettings();
      const mockConfigApp = { constructor: { name: 'VGMusicConfig' }, rendered: true, selectedMood: '', render: vi.fn() };
      const mockTreeApp = { constructor: { name: 'PlaylistTreeApp' }, rendered: true, render: vi.fn() };
      globalThis.ui = { windows: { w1: mockConfigApp, w2: mockTreeApp } };

      const settingObj = game.settings.register.mock.calls.find((call) => call[1] === CONST.settings.activeMood)?.[2];
      expect(settingObj).toBeDefined();

      settingObj.onChange('boss');

      expect(mockConfigApp.selectedMood).toBe('boss');
      expect(mockConfigApp.render).toHaveBeenCalledWith(false);
      expect(mockTreeApp.render).toHaveBeenCalledWith(false);
    });
  });

  describe('handleOpenPlaylistTree', () => {
    it('calls PlaylistTreeApp.open to launch the hierarchy tree manager', () => {
      const event = { preventDefault: vi.fn() };
      game.vgmusic = { playlistTree: null };

      MoodWidget.handleOpenPlaylistTree(event, null);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(game.vgmusic.playlistTree).toBeDefined();
    });
  });
});
