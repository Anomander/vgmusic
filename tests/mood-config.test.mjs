import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupFoundryMocks } from './mocks/foundry.mjs';

setupFoundryMocks();

import { MoodConfigApp } from '../scripts/mood-config.mjs';
import { CONST } from '../scripts/config.mjs';

describe('MoodConfigApp.formHandler', () => {
  beforeEach(() => {
    setupFoundryMocks();
  });

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
});
