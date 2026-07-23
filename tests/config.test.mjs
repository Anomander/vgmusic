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

    expect(CONST.playlistSections.DefaultMusic.area.priority).toBe(-40);
    expect(CONST.playlistSections.DefaultMusic.combat.priority).toBe(-35);
    expect(CONST.playlistSections.Scene.area.priority).toBe(-20);
    expect(CONST.playlistSections.Scene.combat.priority).toBe(-15);
    expect(CONST.playlistSections.Actor.combat.priority).toBe(0);
    expect(CONST.playlistSections.Token.combat.priority).toBe(20);
  });
});
