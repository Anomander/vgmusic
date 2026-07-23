import { describe, it, expect, beforeEach } from 'vitest';
import { setupFoundryMocks } from './mocks/foundry.mjs';

beforeEach(() => {
  setupFoundryMocks();
});

import { CONST } from '../scripts/config.mjs';

describe('CONST', () => {
  it('moduleId equals "vgmusic"', () => {
    expect(CONST.moduleId).toBe('vgmusic');
  });

  it('settings object contains required setting keys', () => {
    expect(CONST.settings.defaultMusic).toBe('defaultMusic');
    expect(CONST.settings.suppressArea).toBe('suppressArea');
    expect(CONST.settings.suppressCombat).toBe('suppressCombat');
    expect(CONST.settings.fadeDuration).toBe('fadeDuration');
    expect(CONST.settings.activeMood).toBe('activeMood');
    expect(CONST.settings.configuredMoods).toBe('configuredMoods');
    expect(CONST.settings.moodWidgetPosition).toBe('moodWidgetPosition');
  });

  it('playlistSections contains configurations for expected document types', () => {
    expect(CONST.playlistSections.DefaultMusic).toBeDefined();
    expect(CONST.playlistSections.Scene).toBeDefined();
    expect(CONST.playlistSections.Actor).toBeDefined();
    expect(CONST.playlistSections.Token).toBeDefined();

    expect(CONST.playlistSections.Scene.area.label).toBe('VGMusic.PlaylistSection.Area');
    expect(CONST.playlistSections.Scene.combat.label).toBe('VGMusic.PlaylistSection.Combat');
  });
});
