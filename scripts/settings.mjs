import { VGMusicConfig } from './app.mjs';
import { MoodConfigApp } from './mood-config.mjs';
import { MoodWidget } from './mood-widget.mjs';
import { CONST } from './config.mjs';
import { log } from './helpers.mjs';

/**
 * Register module settings and configuration menu
 */
export function registerSettings() {
  game.settings.registerMenu(CONST.moduleId, 'defaultMusicMenu', {
    name: 'VGMusic.Settings.DefaultMusic.Name',
    label: 'VGMusic.Settings.DefaultMusic.Label',
    hint: 'VGMusic.Settings.DefaultMusic.Hint',
    icon: 'fas fa-music',
    type: VGMusicConfig,
    restricted: true
  });

  game.settings.registerMenu(CONST.moduleId, 'moodConfigMenu', {
    name: 'VGMusic.Settings.MoodConfig.Name',
    label: 'VGMusic.Settings.MoodConfig.Label',
    hint: 'VGMusic.Settings.MoodConfig.Hint',
    icon: 'fas fa-sliders-h',
    type: MoodConfigApp,
    restricted: true
  });

  game.settings.register(CONST.moduleId, CONST.settings.defaultMusic, {
    name: 'VGMusic.Settings.DefaultMusic.Name',
    scope: 'world',
    config: false,
    type: Object,
    default: { documentName: 'DefaultMusic', data: { vgmusic: { music: {} } } }
  });

  game.settings.register(CONST.moduleId, CONST.settings.activeMood, {
    name: 'VGMusic.Settings.ActiveMood.Name',
    scope: 'world',
    config: false,
    type: String,
    default: '',
    onChange: () => {
      game.vgmusic?.musicController?.playCurrentTrack();
      if (game.vgmusic?.moodWidget?.rendered) {
        game.vgmusic.moodWidget.render(false);
      }
    }
  });

  game.settings.register(CONST.moduleId, CONST.settings.configuredMoods, {
    name: 'VGMusic.Settings.ConfiguredMoods.Name',
    scope: 'world',
    config: false,
    type: Array,
    default: CONST.defaultMoods,
    onChange: () => {
      if (game.vgmusic?.moodWidget?.rendered) {
        game.vgmusic.moodWidget.render(false);
      }
    }
  });

  game.settings.register(CONST.moduleId, CONST.settings.moodWidgetPosition, {
    scope: 'client',
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(CONST.moduleId, CONST.settings.fadeDuration, {
    name: 'VGMusic.Settings.FadeDuration.Name',
    hint: 'VGMusic.Settings.FadeDuration.Hint',
    scope: 'world',
    config: true,
    type: Number,
    range: { min: 0, max: 10, step: 0.5 },
    default: 0
  });

  game.settings.register(CONST.moduleId, CONST.settings.suppressArea, {
    name: 'VGMusic.Settings.SuppressArea.Name',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
    onChange: () => {
      game.vgmusic?.musicController?.playCurrentTrack();
    }
  });

  game.settings.register(CONST.moduleId, CONST.settings.suppressCombat, {
    name: 'VGMusic.Settings.SuppressCombat.Name',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
    onChange: () => {
      game.vgmusic?.musicController?.playCurrentTrack();
    }
  });

  game.settings.register(CONST.moduleId, 'enableDebug', {
    name: 'VGMusic.Settings.EnableDebug.Name',
    hint: 'VGMusic.Settings.EnableDebug.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: false
  });
}

/**
 * Register keybindings
 */
export function registerKeybindings() {
  game.keybindings.register(CONST.moduleId, 'toggleAreaMusic', {
    name: 'VGMusic.Keybindings.ToggleAreaMusic',
    onDown: () => toggleAreaMusic()
  });

  game.keybindings.register(CONST.moduleId, 'toggleCombatMusic', {
    name: 'VGMusic.Keybindings.ToggleCombatMusic',
    onDown: () => toggleCombatMusic()
  });

  game.keybindings.register(CONST.moduleId, 'toggleMoodWidget', {
    name: 'VGMusic.Keybindings.ToggleMoodWidget',
    onDown: () => MoodWidget.toggle()
  });
}

/**
 * Toggle area music suppression
 */
async function toggleAreaMusic() {
  const current = game.settings.get(CONST.moduleId, CONST.settings.suppressArea);
  const target = !current;
  try {
    await game.settings.set(CONST.moduleId, CONST.settings.suppressArea, target);
    log(3, `Successfully toggled area music suppression to: ${target}`);
  } catch (error) {
    log(1, `Failed to toggle area music suppression to ${target}:`, error);
  }
  ui.controls.initialize();
}

/**
 * Toggle combat music suppression
 */
async function toggleCombatMusic() {
  const current = game.settings.get(CONST.moduleId, CONST.settings.suppressCombat);
  const target = !current;
  try {
    await game.settings.set(CONST.moduleId, CONST.settings.suppressCombat, target);
    log(3, `Successfully toggled combat music suppression to: ${target}`);
  } catch (error) {
    log(1, `Failed to toggle combat music suppression to ${target}:`, error);
  }
  ui.controls.initialize();
}
